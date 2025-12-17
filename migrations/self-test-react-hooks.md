---
id: self-test-react-hooks
title: "Self-Test: Convert React Class Components to Hooks"
owner: "@hachiko-team"
status: draft
agent: claude-cli
strategy:
  chunkBy: file
  maxOpenPRs: 1
checks:
  - "npm run test"
  - "npm run type-check"
  - "npm run lint"
rollback:
  - description: "Revert if tests fail or type errors introduced"
    command: "git revert HEAD"
successCriteria:
  - "All class components in self-test/ converted to hooks"
  - "All tests pass"
  - "No TypeScript errors"
  - "ESLint rules pass"
steps:
  - id: simple-components
    description: "Convert simple components like UserCard with basic state and event handlers"
    expectedPR: true
  - id: lifecycle-components  
    description: "Convert DataFetcher component with componentDidMount, componentDidUpdate, and cleanup"
    expectedPR: true
  - id: complex-components
    description: "Convert FormWizard with refs, getDerivedStateFromProps, advanced lifecycle methods, and complex state"
    expectedPR: true
dependsOn: []
touches:
  - "self-test/src/components/**/*.tsx"
  - "self-test/src/components/**/*.ts"
---

# Self-Test React Class to Hooks Migration

This migration converts the class components in the `self-test/` directory to functional components using React hooks. This serves as an end-to-end test of Hachiko's migration capabilities.

## Context

The `self-test/` directory contains three React class components of increasing complexity:

1. **UserCard** - Simple component with basic state (`isHovered`, `isLoading`)
2. **DataFetcher** - Component with lifecycle methods (`componentDidMount`, `componentDidUpdate`, `componentWillUnmount`)
3. **FormWizard** - Complex component with refs, `getDerivedStateFromProps`, advanced state management, and cleanup

This migration tests Hachiko's ability to handle the full spectrum of React class component patterns.

## Migration Strategy

### Step 1: Simple Components (UserCard)

- Convert basic state to `useState`
- Transform event handlers to arrow functions
- Maintain existing prop interfaces
- Test hover state functionality

**Before:**

```typescript
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
```

**After:**

```typescript
const UserCard: React.FC<UserCardProps> = ({ user, onClick, showAvatar = true }) => {
  const [isHovered, setIsHovered] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const handleMouseEnter = () => {
    setIsHovered(true)
  }
```

### Step 2: Lifecycle Components (DataFetcher)

- Convert `componentDidMount` to `useEffect(() => {}, [])`
- Convert `componentDidUpdate` to `useEffect(() => {}, [dependencies])`
- Convert `componentWillUnmount` cleanup to `useEffect` return function
- Handle AbortController cleanup properly

**Before:**

```typescript
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
```

**After:**

```typescript
useEffect(() => {
  fetchData()
}, [])

useEffect(() => {
  fetchData()
}, [url])

useEffect(() => {
  return () => {
    if (abortController) {
      abortController.abort()
    }
  }
}, [])
```

### Step 3: Complex Components (FormWizard)

- Convert refs using `useRef`
- Replace `getDerivedStateFromProps` with `useEffect` and state derivation
- Handle complex state with multiple `useState` calls or `useReducer`
- Convert lifecycle methods to appropriate `useEffect` hooks
- Maintain event listener cleanup and auto-save functionality

**Complex Patterns to Handle:**

- Multiple refs stored in object → `useRef` for each
- `getDerivedStateFromProps` → `useEffect` with dependency on props
- Complex state updates → Consider `useReducer`
- Event listeners on window → `useEffect` with cleanup
- setTimeout/setInterval → `useEffect` with cleanup

## Success Criteria

1. All components are functional components using hooks
2. No class component syntax remains
3. All existing functionality is preserved
4. TypeScript compilation passes
5. All tests pass (when implemented)
6. No ESLint errors related to hooks rules

## Testing Notes

This migration serves as a comprehensive test of Hachiko's capabilities:

- **Step 1** tests basic state conversion
- **Step 2** tests lifecycle method conversion
- **Step 3** tests complex patterns and edge cases

The components are intentionally designed with realistic complexity patterns found in production React codebases.

## Rollback Plan

If any step fails:

1. Revert the specific problematic commit
2. Address issues in development
3. Re-run migration step once fixes are validated

This ensures the self-test environment remains stable while validating Hachiko's migration capabilities.
