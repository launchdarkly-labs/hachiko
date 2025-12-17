import React from "react";

interface ButtonProps {
  onClick: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary";
  children: React.ReactNode;
}

/**
 * Sample class component for React class-to-hooks migration testing.
 * This file should be transformed by the migration agent.
 */
class Button extends React.Component<ButtonProps> {
  render() {
    const { onClick, disabled = false, variant = "primary", children } = this.props;

    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`btn btn-${variant}`}
        data-testid="button"
      >
        {children}
      </button>
    );
  }
}

export default Button;
