import CloudFormation from 'aws-sdk/clients/cloudformation';
import S3 from 'aws-sdk/clients/s3';
import ApiGateway from 'aws-sdk/clients/apigateway';
import { Credentials, CredentialsOptions } from 'aws-sdk/lib/credentials';

import { promises as fs } from 'fs';
import * as path from 'path';
import copy from 'recursive-copy';
import yaml from 'js-yaml';

import { defaultSwaggerUiConfig } from './defaultSwaggerUiConfig';

const EXPORT_TYPES = ['oas30', 'swagger'] as const;
const ACCEPTS = ['application/json', 'application/yaml'] as const;
const EXTENSIONS = ['integrations', 'apigateway', 'authorizers'] as const;

type ExportType = typeof EXPORT_TYPES[number];
type Accepts = typeof ACCEPTS[number];
type Extensions = typeof EXTENSIONS[number];

type SwaggerUiConfig = {
  [key: string]: unknown;
};

type ValidatedConfig = {
  s3Bucket?: string;
  exportType: ExportType;
  accepts: Accepts;
  extensions: Extensions;
  swaggerUiDirectoryName: string;
  swaggerUiConfig?: SwaggerUiConfig;
};

type RawConfig = Partial<ValidatedConfig>;

export type ServerlessSwaggerUiConfig = RawConfig;

type Serverless = {
  getProvider: (providerName: string) => {
    getCredentials: () => {
      credentials?: Credentials | CredentialsOptions;
    };
    naming: {
      getStackName: () => string;
    };
    getRegion: () => string;
    getStage: () => string;
  };
  service: {
    custom?: {
      swaggerUi?: ValidatedConfig;
    };
  };
  config: {
    servicePath: string;
  };
  cli: {
    log: (
      message: string,
      entity?: string,
      opts?: { underline?: boolean; bold?: boolean; color?: string }
    ) => void;
  };
};

export class ServerlessSwaggerUi {
  private credentials?: Credentials | CredentialsOptions;
  private stackName: string;
  private region: string;
  private stage: string;
  constructor(private serverless: Serverless) {
    const provider = this.serverless.getProvider('aws');
    this.credentials = provider.getCredentials().credentials;
    this.stackName = provider.naming.getStackName();
    this.region = provider.getRegion();
    this.stage = provider.getStage();
  }
  private validateConfig = () => {
    const { service } = this.serverless;
    const config: RawConfig =
      (service && service.custom && service.custom.swaggerUi) || {};
    const { s3Bucket, swaggerUiConfig } = config;
    let { exportType, accepts, extensions, swaggerUiDirectoryName } = config;
    if (!exportType || !EXPORT_TYPES.includes(exportType)) {
      exportType = 'oas30';
    }
    if (!accepts || !ACCEPTS.includes(accepts)) {
      accepts = 'application/yaml';
    }
    if (!extensions || !EXTENSIONS.includes(extensions)) {
      extensions = 'integrations';
    }
    if (!swaggerUiDirectoryName) {
      swaggerUiDirectoryName = '.swagger-ui';
    }
    return {
      exportType,
      accepts,
      extensions,
      s3Bucket,
      swaggerUiDirectoryName,
      swaggerUiConfig,
    };
  };
  private copySwaggerUi = async ({
    swaggerUiPath,
  }: {
    swaggerUiPath: string;
  }) => {
    await fs.rmdir(swaggerUiPath, { recursive: true });
    return await copy(
      path.dirname(require.resolve('swagger-ui-dist')),
      swaggerUiPath,
      {
        filter: ['**/*', '!index.html'],
      }
    );
  };
  private copyIndexFile = async ({
    swaggerUiPath,
  }: {
    swaggerUiPath: string;
  }) => {
    await copy(
      require.resolve('./index.html'),
      path.join(swaggerUiPath, 'index.html')
    );
  };
  private writeConfigYaml = async ({
    swaggerUiPath,
    swaggerUiConfig,
    documentationFileName,
  }: {
    swaggerUiPath: string;
    swaggerUiConfig?: SwaggerUiConfig;
    documentationFileName: string;
  }) => {
    const configFileName = 'config.yaml';
    const obj = {
      ...defaultSwaggerUiConfig,
      ...swaggerUiConfig,
      configUrl: undefined,
      url: `./${documentationFileName}`,
    };
    delete obj.configUrl;
    await fs.writeFile(
      path.join(swaggerUiPath, configFileName),
      yaml.dump(obj)
    );
  };
  private writeDocumentationFile = async ({
    exportType,
    accepts,
    extensions,
    swaggerUiPath,
    documentationFileName,
  }: {
    exportType: ExportType;
    accepts: Accepts;
    extensions: Extensions;
    swaggerUiPath: string;
    documentationFileName: string;
  }) => {
    const apiId = await this.resolveApiGatewayId();
    const documentationBody = await this.getDocumentation({
      apiId,
      exportType,
      accepts,
      extensions,
    });
    if (!documentationBody) {
      throw new Error('documentation body is falsy');
    }
    await fs.writeFile(
      path.join(swaggerUiPath, documentationFileName),
      documentationBody.toString()
    );
  };
  private resolveApiGatewayId = async (): Promise<string> => {
    this.serverless.cli.log(
      'Resolving API Gateway ID...',
      'Serverless SwaggerUI'
    );
    const cfn = new CloudFormation({
      credentials: this.credentials,
      region: this.region,
    });
    // throw error if stack does not exist
    const stack = await cfn
      .describeStacks({
        StackName: this.stackName,
      })
      .promise();
    const stacks = stack.Stacks;
    if (!stacks || stacks.length < 1) {
      throw new Error(`Stack: ${this.stackName} does not have any stacks`);
    }
    const { Outputs } = stacks[0];
    if (!Outputs) {
      throw new Error(`Stack: ${this.stackName} does not have any Outputs`);
    }
    const output = Outputs.find(
      (output) => output.OutputKey === 'ServiceEndpoint'
    );
    if (!output) {
      throw new Error(
        `Stack: ${this.stackName} does not have Output: ServiceEndpoint`
      );
    }
    const { OutputValue } = output;
    if (!OutputValue) {
      throw new Error(
        `Stack: ${this.stackName} does not have OutputValue: ServiceEndpoint`
      );
    }
    const [, apiId] = OutputValue.split('.')[0].split('//');
    return apiId;
  };
  private getDocumentation = async ({
    apiId,
    exportType,
    accepts,
    extensions,
  }: {
    apiId: string;
    exportType: ExportType;
    accepts: Accepts;
    extensions: Extensions;
  }) => {
    this.serverless.cli.log(
      'Exporting documentation...',
      'Serverless SwaggerUI'
    );
    const ag = new ApiGateway({
      credentials: this.credentials,
      region: this.region,
    });
    const doc = await ag
      .getExport({
        exportType,
        restApiId: apiId,
        stageName: this.stage,
        accepts,
        parameters: {
          extensions,
        },
      })
      .promise();
    return doc.body;
  };
  private uploadToS3 = async ({
    swaggerUiPath,
    s3Bucket,
  }: {
    swaggerUiPath: string;
    s3Bucket: string;
  }) => {
    this.serverless.cli.log(
      'Uploading Swagger UI files to S3...',
      'Serverless SwaggerUI'
    );
    const s3 = new S3({
      credentials: this.credentials,
      region: this.region,
    });
    const fileNames = await fs.readdir(swaggerUiPath);
    const resolveContentType = (fileName: string) => {
      const ext = path.extname(fileName);
      switch (ext) {
        case '.css':
          return 'text/css';
        case '.html':
          return 'text/html; charset=utf-8';
        case '.js':
          return 'text/javascript';
        case '.json':
        case '.map':
          return 'application/json';
        case '.png':
          return 'image/png';
        case '.yaml':
          return 'text/yaml';
        default:
          return undefined;
      }
    };
    await Promise.all(
      fileNames.map(async (fileName) => {
        return s3
          .putObject({
            Bucket: s3Bucket,
            Key: fileName,
            Body: await fs.readFile(path.join(swaggerUiPath, fileName)),
            ContentType: resolveContentType(fileName),
          })
          .promise();
      })
    );
  };
  swaggerUi = async (): Promise<void> => {
    const {
      exportType,
      accepts,
      extensions,
      s3Bucket,
      swaggerUiDirectoryName,
      swaggerUiConfig,
    } = this.validateConfig();
    const swaggerUiPath = path.join(
      this.serverless.config.servicePath,
      swaggerUiDirectoryName
    );
    await this.copySwaggerUi({ swaggerUiPath });
    await this.copyIndexFile({ swaggerUiPath });
    const documentationFileName = `swagger.${
      accepts === 'application/yaml' ? 'yaml' : 'json'
    }`;
    await this.writeConfigYaml({
      swaggerUiPath,
      swaggerUiConfig,
      documentationFileName,
    });
    await this.writeDocumentationFile({
      exportType,
      accepts,
      extensions,
      swaggerUiPath,
      documentationFileName,
    });
    if (s3Bucket) {
      await this.uploadToS3({ swaggerUiPath, s3Bucket });
    }
  };
  commands = {
    swaggerUi: {
      usage: 'Build Swagger UI static site',
      lifecycleEvents: ['swaggerUi'],
    },
  };
  hooks = {
    'after:deploy:deploy': this.swaggerUi,
    'swaggerUi:swaggerUi': this.swaggerUi,
  };
}

module.exports = ServerlessSwaggerUi;
