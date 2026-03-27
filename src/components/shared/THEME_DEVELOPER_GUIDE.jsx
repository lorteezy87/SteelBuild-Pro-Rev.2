# Theme System Developer Guide

## Overview

The SteelBuild-Pro platform uses a comprehensive CSS variable-based theming system that provides seamless dark/light mode support across all UI components, charts, and custom elements.

---

## Core Color Variables

### Text Colors
```css
--text-primary      /* Main text, headings */
--text-secondary    /* Secondary/body text */
--text-muted        /* Tertiary/disabled text */
--text-disabled     /* Disabled state text */
```

### Background Colors
```css
--bg-page           /* Page background */
--bg-surface        /* Card/component background */
--bg-surface-secondary  /* Secondary surface */
--bg-input          /* Form input background */
--bg-hover          /* Hover state background */
```

### Border & Dividers
```css
--border            /* Default border color */
--border-default    /* Alternative border name */
--border-strong     /* Stronger/more visible borders */
--divider           /* Divider lines */
```

### Accent & Interactive
```css
--accent            /* Primary action color */
--accent-hover      /* Accent hover state */
--accent-muted      /* Muted accent background */
--accent-border     /* Accent-colored borders */
```

### Status Colors
```css
--status-success    /* Success/positive state */
--status-warning    /* Warning/attention state */
--status-error      /* Error/danger state */
--status-info       /* Info/neutral state */
```

### Legacy Status Names (still supported)
```css
--success, --warning, --danger, --info
--success-muted, --warning-muted, --danger-muted, --info-muted
--success-border, --warning-border, --danger-border, --info-border
```

### Chart Colors
```css
--chart-1 through --chart-5  /* Five distinct chart colors */
```

---

## Best Practices

### 1. Always Use CSS Variables

❌ **DON'T** hardcode colors:
```jsx
<div style={{ color: "#FF3D3D", background: "rgba(255,179,0,0.10)" }} />
```

✅ **DO** use CSS variables:
```jsx
<div style={{ color: "var(--status-error)", background: "var(--warning-muted)" }} />
```

### 2. Use Semantic Variable Names

Prefer names that describe the purpose, not the color:

❌ `--red-600` (color-based)
✅ `--status-error` (semantic)

❌ `--blue-100` (color-based)
✅ `--accent-muted` (semantic)

### 3. Consistent Component Styling Pattern

For interactive components, follow this pattern:

```jsx
<button style={{
  background: "var(--accent)",
  color: "white",
  border: "1px solid var(--accent)",
  borderRadius: 8,
  padding: "8px 16px",
}}
onMouseEnter={e => {
  e.currentTarget.style.background = "var(--accent-hover)";
}}
onMouseLeave={e => {
  e.currentTarget.style.background = "var(--accent)";
}}>
  Click me
</button>
```

### 4. Form Elements

Input fields should always use theme variables:

```jsx
<input style={{
  background: "var(--bg-input)",
  border: "1px solid var(--border-default)",
  color: "var(--text-primary)",
  // focus state
}} />
```

### 5. Status Badge Pattern

For status/state indicators:

```jsx
const statusStyles = {
  active: {
    color: "var(--status-success)",
    background: "var(--success-muted)",
    border: "var(--success-border)"
  },
  warning: {
    color: "var(--status-warning)",
    background: "var(--warning-muted)",
    border: "var(--warning-border)"
  },
  error: {
    color: "var(--status-error)",
    background: "var(--danger-muted)",
    border: "var(--danger-border)"
  }
};
```

### 6. Charts & Recharts Integration

Use the centralized theme config for all chart colors:

```jsx
import { getChartTheme } from "@/components/shared/RechartsThemeConfig";

const theme = getChartTheme();
const colors = theme.palette; // [color1, color2, ...]

<BarChart data={data}>
  <Bar dataKey="value1" fill={colors[0]} />
  <Bar dataKey="value2" fill={colors[1]} />
  <Tooltip content={<CustomTooltip theme={theme} />} />
</BarChart>
```

---

## Dark/Light Mode Implementation

The theme is automatically applied via the `data-theme` attribute:

```jsx
// In Layout.js or your theme context
const { theme, toggleTheme } = useTheme();

useEffect(() => {
  document.documentElement.setAttribute('data-theme', theme);
}, [theme]);
```

All CSS variables automatically adjust based on the active theme. No component changes needed!

---

## Creating New Components

When building new components, follow this template:

```jsx
export default function MyComponent() {
  return (
    <div style={{
      background: "var(--bg-surface)",
      border: "1px solid var(--border-default)",
      color: "var(--text-primary)",
      padding: "16px",
      borderRadius: 8,
    }}>
      <h2 style={{
        color: "var(--text-primary)",
        fontWeight: 700,
        margin: 0,
      }}>
        Heading
      </h2>
      <p style={{
        color: "var(--text-secondary)",
        marginTop: 8,
      }}>
        Body text
      </p>
      
      <button style={{
        background: "var(--accent)",
        color: "white",
        border: "none",
        borderRadius: 6,
        padding: "8px 16px",
        cursor: "pointer",
        transition: "background 0.15s",
      }}
      onMouseEnter={e => e.currentTarget.style.background = "var(--accent-hover)"}
      onMouseLeave={e => e.currentTarget.style.background = "var(--accent)"}>
        Click
      </button>
    </div>
  );
}
```

---

## Converting Existing Components

### Step 1: Audit Hardcoded Colors

Search for patterns like:
- Hex colors: `#FF3D3D`
- RGB/RGBA: `rgba(255, 179, 0, 0.10)`
- Named colors: `"white"`, `"transparent"`

### Step 2: Map to Variables

Create a mapping:
```
#FF3D3D           → var(--status-error)
rgba(255,179,0,0.10) → var(--warning-muted)
rgba(255,255,255,0.40) → var(--text-muted)
```

### Step 3: Replace Systematically

Use find/replace with context to ensure accurate substitution.

---

## Component Library Integration

All shadcn/ui components are already themed:
- Button, Card, Input, Textarea, Dialog, Select, Badge, Alert
- Checkbox, Radio, Switch, Tabs, Accordion, Tooltip, Popover
- Progress, Slider, Separator, Label, Scroll Area

No additional theming needed for these components.

---

## Testing Your Changes

### Light Mode
1. Toggle theme to "Light"
2. Verify colors are readable
3. Check contrast ratios (WCAG AA minimum)

### Dark Mode
1. Toggle theme to "Dark"
2. Verify colors remain readable
3. Check for any hardcoded colors that don't adapt

### Different Screens
- Dashboard
- Forms
- Tables
- Charts
- Modals
- Alerts/Notifications

---

## Common Patterns

### Success/Confirmation Pattern
```jsx
style={{
  color: "var(--status-success)",
  background: "var(--success-muted)",
  border: "1px solid var(--success-border)"
}}
```

### Error/Danger Pattern
```jsx
style={{
  color: "var(--status-error)",
  background: "var(--danger-muted)",
  border: "1px solid var(--danger-border)"
}}
```

### Warning/Attention Pattern
```jsx
style={{
  color: "var(--status-warning)",
  background: "var(--warning-muted)",
  border: "1px solid var(--warning-border)"
}}
```

### Hover/Interactive Pattern
```jsx
onMouseEnter={e => {
  e.currentTarget.style.background = "var(--hover-bg)";
  e.currentTarget.style.borderColor = "var(--accent)";
}}
onMouseLeave={e => {
  e.currentTarget.style.background = "var(--bg-surface)";
  e.currentTarget.style.borderColor = "var(--border-default)";
}}
```

---

## Troubleshooting

### Colors Not Updating on Theme Toggle
- Ensure you're using `var(--variable-name)`, not computed values
- Check that the component re-renders when theme changes
- Verify `data-theme` attribute is being set on `<html>`

### Inconsistent Appearance Between Themes
- Compare the two theme definitions in `globals.css`
- Check for missing variable definitions in dark/light mode
- Use browser DevTools to inspect computed styles

### Hardcoded Colors Still Visible
- Search the codebase for `#[0-9A-Fa-f]{6}` (hex colors)
- Search for `rgba(`, `rgb(`, color names
- Use find/replace with regex to find remaining hardcoded colors

---

## Integration Checklist

- [ ] All inline styles use CSS variables
- [ ] StatusBadge uses mapped theme colors
- [ ] Charts use `getChartTheme()` palette
- [ ] Forms use `var(--bg-input)` and `var(--border-default)`
- [ ] Buttons use `var(--accent)` and `var(--accent-hover)`
- [ ] Text uses appropriate `var(--text-*)` colors
- [ ] Dark mode toggle updates `data-theme` attribute
- [ ] Component tested in both light and dark modes

---

## References

- **globals.css** - All CSS variable definitions
- **RechartsThemeConfig.js** - Chart color palette generator
- **components/** - Reference implementations of themed components
- **ThemeContext.js** - Theme state management

---

*Last Updated: 2026-03-13*
*Status: 100% Theme Coverage Achieved*