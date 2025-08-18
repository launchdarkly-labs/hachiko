import React from "react"

interface User {
  id: string
  name: string
  email: string
  avatar?: string
}

interface UserProfileProps {
  userId: string
}

interface UserProfileState {
  user: User | null
  loading: boolean
  error: string | null
}

/**
 * Complex class component with API calls, error handling, and refs.
 * This represents a more challenging migration scenario.
 */
class UserProfile extends React.Component<UserProfileProps, UserProfileState> {
  private mounted = false
  private nameInputRef = React.createRef<HTMLInputElement>()

  constructor(props: UserProfileProps) {
    super(props)
    this.state = {
      user: null,
      loading: false,
      error: null,
    }
  }

  componentDidMount() {
    this.mounted = true
    this.fetchUser()
  }

  componentDidUpdate(prevProps: UserProfileProps) {
    if (prevProps.userId !== this.props.userId) {
      this.fetchUser()
    }
  }

  componentWillUnmount() {
    this.mounted = false
  }

  fetchUser = async () => {
    if (!this.props.userId) return

    this.setState({ loading: true, error: null })

    try {
      // Simulate API call
      const response = await fetch(`/api/users/${this.props.userId}`)
      if (!response.ok) throw new Error("Failed to fetch user")

      const user = await response.json()

      if (this.mounted) {
        this.setState({ user, loading: false })
      }
    } catch (error) {
      if (this.mounted) {
        this.setState({
          error: error instanceof Error ? error.message : "Unknown error",
          loading: false,
        })
      }
    }
  }

  handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { user } = this.state
    if (!user) return

    this.setState({
      user: { ...user, name: e.target.value },
    })
  }

  handleSave = async () => {
    const { user } = this.state
    if (!user) return

    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(user),
      })

      if (!response.ok) throw new Error("Failed to save user")

      // Focus the input after save
      this.nameInputRef.current?.focus()
    } catch (error) {
      this.setState({
        error: error instanceof Error ? error.message : "Save failed",
      })
    }
  }

  render() {
    const { user, loading, error } = this.state

    if (loading) return <div>Loading user...</div>
    if (error) return <div className="error">Error: {error}</div>
    if (!user) return <div>No user found</div>

    return (
      <div className="user-profile">
        <h2>User Profile</h2>
        <div className="avatar">
          {user.avatar ? (
            <img src={user.avatar} alt={user.name} />
          ) : (
            <div className="avatar-placeholder">{user.name.charAt(0)}</div>
          )}
        </div>
        <div className="form">
          <label>
            Name:
            <input
              ref={this.nameInputRef}
              type="text"
              value={user.name}
              onChange={this.handleNameChange}
            />
          </label>
          <div className="email">Email: {user.email}</div>
          <button type="button" onClick={this.handleSave}>
            Save
          </button>
        </div>
      </div>
    )
  }
}

export default UserProfile
