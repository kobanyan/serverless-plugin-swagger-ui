# serverless-plugin-swagger-ui

[![serverless](http://public.serverless.com/badges/v3.svg)](https://www.serverless.com)
[![npm](https://img.shields.io/npm/v/serverless-plugin-swagger-ui.svg?style=flat-square)](https://www.npmjs.com/package/serverless-plugin-swagger-u)
![node](https://img.shields.io/node/v/serverless-plugin-swagger-ui.svg?style=flat-square)
![serverless](https://img.shields.io/npm/dependency-version/serverless-plugin-swagger-ui/peer/serverless.svg?style=flat-square)
[![code style](https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square)](https://github.com/prettier/prettier)
![license](https://img.shields.io/npm/l/serverless-plugin-swagger-ui.svg?style=flat-square)
[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)

A serverless plugin to build Swagger UI static site

## Installation

```sh
npm install --save-dev serverless-plugin-swagger-ui
# or
yarn add --dev serverless-plugin-swagger-ui
```

## Configuration

```yaml
plugins:
  - serverless-plugin-swagger-ui

custom:
  swaggerUi:
    # [Optional] The name of S3 bucket to serve Swagger UI static site. If you set the S3 bucket name, this plugin will upload documentation files to the S3 bucket.
    s3Bucket: 'default is undefined'
    #  [Optional] The type of export. Acceptable values are 'oas30' for OpenAPI 3.0.x and 'swagger' for Swagger/OpenAPI 2.0.
    exportType: oas30 # default value
    # [Optional] The content-type of the export. Currently application/json and application/yaml are supported for exportType of oas30 and swagger.
    accepts: application/yaml # default value
    # [Optional] For exportType oas30 and swagger, any combination of the following parameters are supported: extensions='integrations' or extensions='apigateway' will export the API with x-amazon-apigateway-integration extensions. extensions='authorizers' will export the API with x-amazon-apigateway-authorizer extensions. postman will export the API with Postman extensions, allowing for import to the Postman tool.
    extensions: integrations # default value
    # [Optional] The name of local directory to build Swagger UI static site
    swaggerUiDirectoryName: .swagger-ui # default value
    # [Optional] Swagger UI configuration. See https://swagger.io/docs/open-source-tools/swagger-ui/usage/configuration/ . 'configUrl' will be ignored.
    swaggerUiConfig: # default value is the below
      dom_id: '#swagger-ui'
      deepLinking: true
      presets:
        - SwaggerUIBundle.presets.apis
        - SwaggerUIStandalonePreset
      plugins:
        - SwaggerUIBundle.plugins.DownloadUrl
      layout:
        - StandaloneLayout
```

[See example](https://github.com/kobanyan/serverless-plugin-swagger-ui/tree/master/example).

## Usage

To build Swagger UI static site after deploy:

`serverless deploy`

To build Swagger UI static site:

`serverless swaggerUi`

## License

MIT © [kobanyan](https://github.com/kobanyan)
