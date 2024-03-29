import nockNamespace, {
  HttpHeaders,
  POJO,
  ReplyBody,
  ReplyCallbackResult,
  RequestBodyMatcher
} from 'nock'
import { Url } from 'url'
import deepMerge from 'deepmerge'

export interface GlobalOptions {
  host: string | RegExp | Url
  delayConnection?: number
  times?: number
  nockOptions?: nockNamespace.Options
  allowProtocolOmission?: boolean
  allowSlashOmission?: boolean
}

export interface EndpointOptions {
  anyParams?: boolean
  requestQuery?: nockNamespace.RequestBodyMatcher
  requestBody?: nockNamespace.RequestBodyMatcher
}

export type ResponseFunction = (path: string, requestBody: POJO) => ReplyCallbackResult

export type EndpointResponse =
  | {
      responseCode: number
      body?: ReplyBody
      headers?: HttpHeaders
      errorMessage?: string | POJO
    }
  | POJO
  | ResponseFunction

enum HttpMethod {
  get = 'get',
  post = 'post'
}

type Nock = (host: string | RegExp | Url, options?: nockNamespace.Options) => nockNamespace.Scope

export class MockTurtle {
  private readonly nock: Nock
  private readonly optionDefaults: Partial<GlobalOptions>

  public constructor(nock: Nock, optionDefaults?: GlobalOptions) {
    this.nock = nock
    this.optionDefaults = optionDefaults || {
      nockOptions: {}
    }
  }

  public mockGet(
    endpointPath: string | RegExp | ((uri: string) => boolean),
    mockedResponse?: EndpointResponse,
    endpointOptions?: EndpointOptions,
    optionOverrides?: Partial<GlobalOptions>
  ): nockNamespace.Interceptor {
    return this.mockEndpoint(
      HttpMethod.get,
      endpointPath,
      endpointOptions,
      mockedResponse,
      optionOverrides
    )
  }

  public mockPost(
    endpointPath: string | RegExp | ((uri: string) => boolean),
    mockedResponse?: EndpointResponse,
    endpointOptions?: EndpointOptions,
    optionOverrides?: Partial<GlobalOptions>
  ): nockNamespace.Interceptor {
    return this.mockEndpoint(
      HttpMethod.post,
      endpointPath,
      endpointOptions,
      mockedResponse,
      optionOverrides
    )
  }

  public disableExternalCalls() {
    // @ts-ignore
    this.nock.disableNetConnect()
  }

  public reset() {
    // @ts-ignore
    this.nock.cleanAll()
    // @ts-ignore
    this.nock.enableNetConnect()
  }

  private mockEndpoint(
    method: HttpMethod,
    endpointPath: string | RegExp | ((uri: string) => boolean),
    endpointOptions?: EndpointOptions,
    mockedResponse?: EndpointResponse,
    optionOverrides?: Partial<GlobalOptions>
  ): nockNamespace.Interceptor {
    endpointPath = endpointPath || '/'

    const resolvedGlobalOptions: GlobalOptions = deepMerge(
      this.optionDefaults,
      optionOverrides || {}
    )
    const resolvedEndpointOptions: EndpointOptions = endpointOptions || {}

    validateOptions(resolvedGlobalOptions, resolvedEndpointOptions, endpointPath)
    let bodyParam: RequestBodyMatcher | undefined
    if (resolvedEndpointOptions.requestBody) {
      bodyParam = resolvedEndpointOptions.requestBody
    }
    if (resolvedEndpointOptions.anyParams) {
      bodyParam = () => true
    }

    const mockBuilder = this.nock(resolvedGlobalOptions.host, resolvedGlobalOptions.nockOptions)[
      method
    ](endpointPath, bodyParam)

    if (resolvedEndpointOptions.requestQuery) {
      mockBuilder.query(resolvedEndpointOptions.requestQuery)
    }
    if (resolvedEndpointOptions.anyParams) {
      mockBuilder.query(() => true)
    }

    if (resolvedGlobalOptions.delayConnection) {
      mockBuilder.delayConnection(resolvedGlobalOptions.delayConnection)
    }

    if (resolvedGlobalOptions.times) {
      mockBuilder.times(resolvedGlobalOptions.times)
    }

    // @ts-ignore
    if (mockedResponse && mockedResponse.errorMessage) {
      // @ts-ignore
      mockBuilder.replyWithError(mockedResponse.errorMessage)
    }

    setReply(mockBuilder, mockedResponse)
    return mockBuilder
  }
}

function validateOptions(
  resolvedGlobalOptions: GlobalOptions,
  resolvedEndpointOptions: EndpointOptions,
  endpointPath: string | RegExp | ((uri: string) => boolean)
) {
  if (
    !resolvedGlobalOptions.allowProtocolOmission &&
    typeof resolvedGlobalOptions.host === 'string' &&
    !resolvedGlobalOptions.host.startsWith('http')
  ) {
    throw new Error(
      `Please add "http://" or "https://" to your host, otherwise mocking is unlikely to work. If you are pretty sure you don't need it, set "allowProtocolOmission" to true.`
    )
  }

  if (
    !resolvedGlobalOptions.allowSlashOmission &&
    typeof endpointPath === 'string' &&
    !endpointPath.startsWith('/')
  ) {
    throw new Error(
      `Please add "/" to your endpoint path, otherwise mocking is unlikely to work. If you are pretty sure you don't need it, set "allowSlashOmission" to true.`
    )
  }

  if (
    resolvedEndpointOptions.anyParams &&
    (resolvedEndpointOptions.requestBody || resolvedEndpointOptions.requestQuery)
  ) {
    throw new Error(
      'When "anyParams" flag is set to true, no "requestBody" or "requestQuery" can be set.'
    )
  }
}

function setReply(mockBuilder: nockNamespace.Interceptor, endpointReply?: EndpointResponse) {
  // Handle reply callback function
  if (typeof endpointReply === 'function') {
    mockBuilder.reply(endpointReply as any)
    return
  }

  // Handle static reply
  const resolvedReply: EndpointResponse = endpointReply
    ? resolveStaticResponse(endpointReply)
    : {
        responseCode: 200
      }

  mockBuilder.reply(resolvedReply.responseCode, resolvedReply.body, resolvedReply.headers)
}

function resolveStaticResponse(response: POJO): EndpointResponse {
  if (response.responseCode) {
    return response
  }
  return {
    responseCode: 200,
    body: response
  }
}
