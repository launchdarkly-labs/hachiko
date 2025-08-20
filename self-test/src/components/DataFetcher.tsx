import React from "react"

interface DataFetcherProps {
  url: string
  onDataLoaded?: (data: any) => void
  onError?: (error: Error) => void
  children: (data: any, loading: boolean, error: Error | null) => React.ReactNode
}

interface DataFetcherState {
  data: any
  loading: boolean
  error: Error | null
}

/**
 * Data fetcher component with lifecycle methods and complex state.
 * This represents step 2: component with componentDidMount, componentDidUpdate, and error boundaries.
 * More complex conversion requiring useEffect and proper dependency management.
 */
class DataFetcher extends React.Component<DataFetcherProps, DataFetcherState> {
  private abortController: AbortController | null = null

  constructor(props: DataFetcherProps) {
    super(props)
    this.state = {
      data: null,
      loading: false,
      error: null,
    }
  }

  componentDidMount() {
    this.fetchData()
  }

  componentDidUpdate(prevProps: DataFetcherProps) {
    if (prevProps.url !== this.props.url) {
      this.fetchData()
    }
  }

  componentWillUnmount() {
    if (this.abortController) {
      this.abortController.abort()
    }
  }

  fetchData = async () => {
    // Cancel previous request
    if (this.abortController) {
      this.abortController.abort()
    }

    this.abortController = new AbortController()

    this.setState({ loading: true, error: null })

    try {
      const response = await fetch(this.props.url, {
        signal: this.abortController.signal,
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()

      this.setState({ data, loading: false })

      if (this.props.onDataLoaded) {
        this.props.onDataLoaded(data)
      }
    } catch (error) {
      if (error.name !== "AbortError") {
        const errorObj = error instanceof Error ? error : new Error(String(error))
        this.setState({ error: errorObj, loading: false })

        if (this.props.onError) {
          this.props.onError(errorObj)
        }
      }
    }
  }

  retry = () => {
    this.fetchData()
  }

  render() {
    const { data, loading, error } = this.state

    return (
      <div className="data-fetcher">
        {this.props.children(data, loading, error)}
        {error && (
          <button type="button" onClick={this.retry} className="retry-button">
            Retry
          </button>
        )}
      </div>
    )
  }
}

export default DataFetcher
