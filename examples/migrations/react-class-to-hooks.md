---
id: react-class-to-hooks
title: "Migrate React class components to hooks"
owner: "@team-frontend"
status: draft
agent: claude-cli
strategy:
  chunkBy: directory
  maxOpenPRs: 2
checks:
  - "npm test"
  - "npm run type-check"
  - "npm run lint"
rollback:
  - description: "Revert if tests fail or type errors introduced"
    command: "git revert HEAD"
successCriteria:
  - "No class components remain in src/components"
  - "All tests pass"
  - "No TypeScript errors"
  - "ESLint rules pass"
steps:
  - id: detect
    description: "Inventory class components and analyze conversion complexity"
    expectedPR: false
  - id: simple-components
    description: "Convert simple class components without lifecycle methods"
    expectedPR: true
  - id: stateful-components
    description: "Convert components with state using useState hook"
    expectedPR: true
  - id: lifecycle-components
    description: "Convert components with lifecycle methods using useEffect"
    expectedPR: true
  - id: complex-components
    description: "Handle complex components with refs, context, and edge cases"
    expectedPR: true
  - id: cleanup
    description: "Remove unused imports and update prop types"
    expectedPR: true
  - id: verify
    description: "Run full test suite and verify no regressions"
    expectedPR: false
dependsOn: []
touches:
  - "src/components/**/*.tsx"
  - "src/components/**/*.ts"
  - "src/hooks/**/*.ts"
  - "**/*.test.tsx"
---

# React Class Components to Hooks Migration

This migration plan will convert all React class components to functional components using hooks across the entire frontend codebase.

## Context

Our React codebase currently uses a mix of class and functional components. Converting to hooks provides:
- Simplified component logic and better readability
- Easier state management and side effects
- Better performance with React's optimization features
- Improved testability and code reuse
- Alignment with modern React best practices

## Migration Strategy

1. **Detect**: Scan for class components and categorize by complexity
2. **Simple Components**: Convert presentational components first
3. **Stateful Components**: Handle `this.state` → `useState` conversions
4. **Lifecycle Components**: Convert lifecycle methods to `useEffect`
5. **Complex Components**: Handle refs, context, and advanced patterns
6. **Cleanup**: Remove unused imports and optimize hook usage
7. **Verify**: Ensure all functionality and tests remain intact

## Technical Details

### Key Transformations

**Simple Class Component:**
```typescript
// Before
class Button extends React.Component<Props> {
  render() {
    return <button onClick={this.props.onClick}>{this.props.children}</button>
  }
}

// After
const Button: React.FC<Props> = ({ onClick, children }) => {
  return <button onClick={onClick}>{children}</button>
}
```

**Stateful Component:**
```typescript
// Before
class Counter extends React.Component<Props, State> {
  state = { count: 0 }
  
  increment = () => {
    this.setState({ count: this.state.count + 1 })
  }
  
  render() {
    return <button onClick={this.increment}>{this.state.count}</button>
  }
}

// After
const Counter: React.FC<Props> = () => {
  const [count, setCount] = useState(0)
  
  const increment = () => setCount(count + 1)
  
  return <button onClick={increment}>{count}</button>
}
```

**Lifecycle Methods:**
```typescript
// Before
componentDidMount() {
  this.fetchData()
}

componentWillUnmount() {
  this.cleanup()
}

// After
useEffect(() => {
  fetchData()
  return cleanup
}, [])
```

### Risk Assessment
- **Low Risk**: Simple presentational components (80% of components)
- **Medium Risk**: Components with basic state and simple lifecycle methods
- **High Risk**: Components with complex lifecycle logic, refs, or legacy patterns

### Success Metrics
- 100% class components converted to functional components
- All existing tests continue to pass
- No performance regressions
- TypeScript compilation without errors
- ESLint rules compliance

## Rollback Plan

If issues are discovered:
1. Revert the specific problematic module
2. Fix issues in a separate branch
3. Re-apply migration once fixes are validated

## Success Criteria

- ✅ All class components converted to functional components
- ✅ All components use hooks instead of lifecycle methods
- ✅ No class component references remain
- ✅ All tests pass in CI
- ✅ TypeScript compilation without errors
- ✅ ESLint react-hooks rules pass
- ✅ No performance regressions
- ✅ Component behavior remains identical
