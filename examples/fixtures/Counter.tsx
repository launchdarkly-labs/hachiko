import React from "react"

interface CounterProps {
  initialValue?: number
  onCountChange?: (count: number) => void
}

interface CounterState {
  count: number
  isLoading: boolean
}

/**
 * Sample stateful class component for React class-to-hooks migration testing.
 * This component uses state and lifecycle methods that need conversion.
 */
class Counter extends React.Component<CounterProps, CounterState> {
  private interval: NodeJS.Timeout | null = null

  constructor(props: CounterProps) {
    super(props)
    this.state = {
      count: props.initialValue || 0,
      isLoading: false,
    }
  }

  componentDidMount() {
    // Simulate some initialization
    this.setState({ isLoading: true })
    setTimeout(() => {
      this.setState({ isLoading: false })
    }, 1000)
  }

  componentDidUpdate(_prevProps: CounterProps, prevState: CounterState) {
    if (prevState.count !== this.state.count) {
      this.props.onCountChange?.(this.state.count)
    }
  }

  componentWillUnmount() {
    if (this.interval) {
      clearInterval(this.interval)
    }
  }

  increment = () => {
    this.setState((prevState) => ({ count: prevState.count + 1 }))
  }

  decrement = () => {
    this.setState((prevState) => ({ count: prevState.count - 1 }))
  }

  reset = () => {
    this.setState({ count: this.props.initialValue || 0 })
  }

  startAutoIncrement = () => {
    if (this.interval) return

    this.interval = setInterval(() => {
      this.increment()
    }, 1000)
  }

  stopAutoIncrement = () => {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
    }
  }

  render() {
    const { count, isLoading } = this.state

    if (isLoading) {
      return <div>Loading...</div>
    }

    return (
      <div className="counter">
        <h2>Count: {count}</h2>
        <div className="controls">
          <button type="button" onClick={this.decrement}>
            -
          </button>
          <button type="button" onClick={this.increment}>
            +
          </button>
          <button type="button" onClick={this.reset}>
            Reset
          </button>
        </div>
        <div className="auto-controls">
          <button type="button" onClick={this.startAutoIncrement}>
            Start Auto
          </button>
          <button type="button" onClick={this.stopAutoIncrement}>
            Stop Auto
          </button>
        </div>
      </div>
    )
  }
}

export default Counter
