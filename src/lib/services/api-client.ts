import { ApiError } from "@/lib/types"

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  headers?: Record<string, string>
  params?: Record<string, string | number>
  timeout?: number
  retries?: number
}

interface ApiResponse<T> {
  data: T
  status: number
  headers: Headers
}

export class ApiClient {
  private baseUrl: string
  private defaultHeaders: Record<string, string>
  private timeout: number

  constructor(
    baseUrl: string, 
    defaultHeaders: Record<string, string> = {},
    timeout: number = 10000
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, '') // Remove trailing slash
    this.defaultHeaders = defaultHeaders
    this.timeout = timeout
  }

  private buildUrl(endpoint: string, params?: Record<string, string | number>): string {
    const url = new URL(`${this.baseUrl}${endpoint}`)
    
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, String(value))
      })
    }
    
    return url.toString()
  }

  private async makeRequest<T>(
    endpoint: string,
    options: RequestOptions = {}
  ): Promise<ApiResponse<T>> {
    const {
      method = 'GET',
      headers = {},
      params,
      timeout = this.timeout,
      retries = 2
    } = options

    const url = this.buildUrl(endpoint, params)
    const requestHeaders = { ...this.defaultHeaders, ...headers }

    // Create AbortController for timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    let lastError: Error | null = null

    // Retry logic
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, {
          method,
          headers: requestHeaders,
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const data = await response.json()
        
        return {
          data,
          status: response.status,
          headers: response.headers,
        }
      } catch (error) {
        lastError = error as Error
        
        // Don't retry on certain errors
        if (
          error instanceof Error && 
          (error.name === 'AbortError' || 
           error.message.includes('4')) // 4xx errors shouldn't be retried
        ) {
          break
        }

        // Wait before retry (exponential backoff)
        if (attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)))
        }
      }
    }

    clearTimeout(timeoutId)
    
    // Transform error into our ApiError format
    const apiError: ApiError = {
      code: 'API_REQUEST_FAILED',
      message: lastError?.message || 'Request failed after retries',
      details: {
        url,
        method,
        retries,
        originalError: lastError?.name || 'Unknown',
      }
    }

    throw apiError
  }

  async get<T>(endpoint: string, options: Omit<RequestOptions, 'method'> = {}): Promise<T> {
    const response = await this.makeRequest<T>(endpoint, { ...options, method: 'GET' })
    return response.data
  }

  async post<T>(endpoint: string, body: unknown, options: Omit<RequestOptions, 'method'> = {}): Promise<T> {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    }
    
    const response = await this.makeRequest<T>(endpoint, {
      ...options,
      method: 'POST',
      headers,
    })
    
    return response.data
  }
}

// Utility function to create API clients with common configurations
export function createApiClient(
  baseUrl: string,
  apiKey?: string,
  keyHeaderName: string = 'X-API-Key'
): ApiClient {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'StableRisk/1.0',
  }

  if (apiKey) {
    headers[keyHeaderName] = apiKey
  }

  return new ApiClient(baseUrl, headers)
} 