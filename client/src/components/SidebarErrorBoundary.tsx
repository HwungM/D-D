import { Component, type ReactNode } from 'react'

interface Props { children: ReactNode; tabName: string }
interface State { hasError: boolean }

export default class SidebarErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error) {
    console.error(`Sidebar tab "${this.props.tabName}" crashed:`, error)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-40 gap-3 px-6 text-center">
          <p className="font-serif text-sm italic" style={{ color: 'rgba(160,140,110,0.5)' }}>
            Something went wrong loading this tab.
          </p>
          <button
            onClick={() => this.setState({ hasError: false })}
            className="font-serif text-xs px-3 py-1.5 transition-all"
            style={{ border: '1px solid rgba(200,146,42,0.3)', color: 'rgba(200,146,42,0.7)' }}
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
