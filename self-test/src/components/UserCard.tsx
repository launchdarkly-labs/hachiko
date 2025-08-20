import React from "react"

interface User {
  id: number
  name: string
  email: string
  avatar?: string
}

interface UserCardProps {
  user: User
  onClick?: (user: User) => void
  showAvatar?: boolean
}

interface UserCardState {
  isHovered: boolean
  isLoading: boolean
}

/**
 * A basic user card component that needs conversion to hooks.
 * This represents step 1: simple class component with minimal state.
 */
class UserCard extends React.Component<UserCardProps, UserCardState> {
  constructor(props: UserCardProps) {
    super(props)
    this.state = {
      isHovered: false,
      isLoading: false,
    }
  }

  handleMouseEnter = () => {
    this.setState({ isHovered: true })
  }

  handleMouseLeave = () => {
    this.setState({ isHovered: false })
  }

  handleClick = () => {
    if (this.props.onClick) {
      this.props.onClick(this.props.user)
    }
  }

  render() {
    const { user, showAvatar = true } = this.props
    const { isHovered, isLoading } = this.state

    return (
      <button
        type="button"
        className={`user-card ${isHovered ? "hovered" : ""}`}
        onMouseEnter={this.handleMouseEnter}
        onMouseLeave={this.handleMouseLeave}
        onClick={this.handleClick}
      >
        {showAvatar && user.avatar && (
          <img src={user.avatar} alt={`${user.name} avatar`} className="avatar" />
        )}
        <div className="user-info">
          <h3>{user.name}</h3>
          <p>{user.email}</p>
        </div>
        {isLoading && <div className="loading">Loading...</div>}
      </button>
    )
  }
}

export default UserCard
