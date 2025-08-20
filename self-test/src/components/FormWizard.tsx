import React from "react"

interface Step {
  id: string
  title: string
  component: React.ComponentType<any>
  validate?: (data: any) => string | null
}

interface FormWizardProps {
  steps: Step[]
  onComplete: (data: any) => void
  onStepChange?: (stepIndex: number) => void
  initialData?: any
}

interface FormWizardState {
  currentStepIndex: number
  formData: any
  errors: Record<string, string>
  isSubmitting: boolean
  history: number[]
  hasUnsavedChanges: boolean
}

/**
 * Complex form wizard with refs, advanced lifecycle methods, and intricate state management.
 * This represents step 3: most complex conversion with refs, complex state updates,
 * advanced patterns like getDerivedStateFromProps, and error boundaries.
 */
class FormWizard extends React.Component<FormWizardProps, FormWizardState> {
  private formRefs: Record<string, React.RefObject<any>> = {}
  private saveTimeoutId: NodeJS.Timeout | null = null

  constructor(props: FormWizardProps) {
    super(props)

    // Initialize refs for each step
    for (const step of props.steps) {
      this.formRefs[step.id] = React.createRef()
    }

    this.state = {
      currentStepIndex: 0,
      formData: props.initialData || {},
      errors: {},
      isSubmitting: false,
      history: [0],
      hasUnsavedChanges: false,
    }
  }

  static getDerivedStateFromProps(props: FormWizardProps, state: FormWizardState) {
    // Update form data if initialData changes
    if (props.initialData && Object.keys(state.formData).length === 0) {
      return {
        formData: { ...props.initialData },
      }
    }
    return null
  }

  componentDidMount() {
    // Focus first input when component mounts
    this.focusCurrentStep()

    // Set up auto-save
    this.setupAutoSave()

    // Add beforeunload listener for unsaved changes
    window.addEventListener("beforeunload", this.handleBeforeUnload)
  }

  componentDidUpdate(_prevProps: FormWizardProps, prevState: FormWizardState) {
    if (prevState.currentStepIndex !== this.state.currentStepIndex) {
      this.focusCurrentStep()

      if (this.props.onStepChange) {
        this.props.onStepChange(this.state.currentStepIndex)
      }
    }

    if (prevState.formData !== this.state.formData) {
      this.setState({ hasUnsavedChanges: true })
      this.scheduleAutoSave()
    }
  }

  componentWillUnmount() {
    if (this.saveTimeoutId) {
      clearTimeout(this.saveTimeoutId)
    }

    window.removeEventListener("beforeunload", this.handleBeforeUnload)
  }

  handleBeforeUnload = (event: BeforeUnloadEvent) => {
    if (this.state.hasUnsavedChanges) {
      event.preventDefault()
      event.returnValue = "You have unsaved changes. Are you sure you want to leave?"
    }
  }

  focusCurrentStep = () => {
    const currentStep = this.props.steps[this.state.currentStepIndex]
    const stepRef = this.formRefs[currentStep.id]

    if (stepRef.current?.focus) {
      setTimeout(() => stepRef.current.focus(), 100)
    }
  }

  setupAutoSave = () => {
    // Save form data to localStorage every 30 seconds
    const autoSaveInterval = setInterval(() => {
      if (this.state.hasUnsavedChanges) {
        localStorage.setItem("formWizard_autosave", JSON.stringify(this.state.formData))
      }
    }, 30000)

    return () => clearInterval(autoSaveInterval)
  }

  scheduleAutoSave = () => {
    if (this.saveTimeoutId) {
      clearTimeout(this.saveTimeoutId)
    }

    this.saveTimeoutId = setTimeout(() => {
      localStorage.setItem("formWizard_autosave", JSON.stringify(this.state.formData))
      this.setState({ hasUnsavedChanges: false })
    }, 2000)
  }

  validateCurrentStep = (): boolean => {
    const currentStep = this.props.steps[this.state.currentStepIndex]

    if (currentStep.validate) {
      const error = currentStep.validate(this.state.formData)

      if (error) {
        this.setState({
          errors: { ...this.state.errors, [currentStep.id]: error },
        })
        return false
      }
      const newErrors = { ...this.state.errors }
      delete newErrors[currentStep.id]
      this.setState({ errors: newErrors })
    }

    return true
  }

  goToNextStep = () => {
    if (!this.validateCurrentStep()) return

    const nextIndex = this.state.currentStepIndex + 1
    if (nextIndex < this.props.steps.length) {
      this.setState({
        currentStepIndex: nextIndex,
        history: [...this.state.history, nextIndex],
      })
    }
  }

  goToPreviousStep = () => {
    const newHistory = [...this.state.history]
    newHistory.pop() // Remove current step
    const previousIndex = newHistory[newHistory.length - 1] || 0

    this.setState({
      currentStepIndex: previousIndex,
      history: newHistory,
    })
  }

  goToStep = (stepIndex: number) => {
    if (stepIndex >= 0 && stepIndex < this.props.steps.length) {
      this.setState({
        currentStepIndex: stepIndex,
        history: [...this.state.history, stepIndex],
      })
    }
  }

  updateFormData = (data: Partial<any>) => {
    this.setState({
      formData: { ...this.state.formData, ...data },
    })
  }

  handleSubmit = async () => {
    if (!this.validateCurrentStep()) return

    this.setState({ isSubmitting: true })

    try {
      await this.props.onComplete(this.state.formData)

      // Clear autosave data on successful submission
      localStorage.removeItem("formWizard_autosave")
      this.setState({ hasUnsavedChanges: false })
    } catch (error) {
      console.error("Form submission failed:", error)

      this.setState({
        errors: {
          ...this.state.errors,
          submit: error instanceof Error ? error.message : "Submission failed",
        },
      })
    } finally {
      this.setState({ isSubmitting: false })
    }
  }

  render() {
    const { steps } = this.props
    const { currentStepIndex, formData, errors, isSubmitting, history } = this.state
    const currentStep = steps[currentStepIndex]
    const CurrentStepComponent = currentStep.component

    const canGoBack = history.length > 1
    const _canGoNext = currentStepIndex < steps.length - 1
    const isLastStep = currentStepIndex === steps.length - 1

    return (
      <div className="form-wizard">
        <div className="wizard-header">
          <div className="step-indicator">
            {steps.map((step, index) => (
              <button
                type="button"
                key={step.id}
                className={`step ${index === currentStepIndex ? "active" : ""} ${
                  index < currentStepIndex ? "completed" : ""
                }`}
                onClick={() => this.goToStep(index)}
              >
                {step.title}
              </button>
            ))}
          </div>

          {this.state.hasUnsavedChanges && <div className="unsaved-indicator">Unsaved changes</div>}
        </div>

        <div className="wizard-content">
          <h2>{currentStep.title}</h2>

          {errors[currentStep.id] && <div className="error-message">{errors[currentStep.id]}</div>}

          <CurrentStepComponent
            ref={this.formRefs[currentStep.id]}
            data={formData}
            onChange={this.updateFormData}
            errors={errors}
          />
        </div>

        <div className="wizard-footer">
          <button
            type="button"
            onClick={this.goToPreviousStep}
            disabled={!canGoBack || isSubmitting}
          >
            Previous
          </button>

          {!isLastStep ? (
            <button type="button" onClick={this.goToNextStep} disabled={isSubmitting}>
              Next
            </button>
          ) : (
            <button type="button" onClick={this.handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? "Submitting..." : "Complete"}
            </button>
          )}

          {errors.submit && <div className="error-message">{errors.submit}</div>}
        </div>
      </div>
    )
  }
}

export default FormWizard
