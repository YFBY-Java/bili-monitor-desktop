import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react"

import "./SearchableSelect.css"

export interface SearchableSelectOption {
  value: string
  label: string
  disabled?: boolean
}

export interface SearchableSelectProps {
  label: string
  value: string
  options: readonly SearchableSelectOption[]
  onChange: (value: string) => void
  disabled?: boolean
  placeholder?: string
}

export function SearchableSelect({ label, value, options, onChange, disabled = false,
  placeholder = "请选择" }: SearchableSelectProps) {
  const listId = useId()
  const listRef = useRef<HTMLUListElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [activeValue, setActiveValue] = useState<string>()
  const expanded = open && !disabled
  const selectedLabel = options.find(option => option.value === value)?.label ?? value
  const visibleOptions = options.filter(option => option.label.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
  const enabledOptions = visibleOptions.filter(option => !option.disabled)
  const activeOption = enabledOptions.find(option => option.value === activeValue)
  const activeIndex = visibleOptions.findIndex(option => option === activeOption)

  useEffect(() => {
    if (expanded && activeIndex >= 0) {
      listRef.current?.children.item(activeIndex)?.scrollIntoView({ block: "nearest" })
    }
  }, [expanded, activeIndex])

  const close = () => {
    setOpen(false)
    setQuery("")
    setActiveValue(undefined)
  }
  const show = () => {
    if (disabled) return
    setOpen(true)
    setQuery("")
    setActiveValue(options.find(option => option.value === value && !option.disabled)?.value)
  }
  const choose = (option: SearchableSelectOption) => {
    if (disabled || option.disabled) return
    if (option.value !== value) onChange(option.value)
    close()
  }
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return
    if (event.key === "Escape") {
      if (expanded) {
        event.preventDefault()
        event.stopPropagation()
        close()
      }
      return
    }
    if (event.key === "Tab") {
      close()
      return
    }
    if (event.key === "Enter") {
      event.preventDefault()
      if (!expanded) show()
      else if (activeOption) choose(activeOption)
      return
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      if (!expanded) {
        show()
        return
      }
      const index = enabledOptions.findIndex(option => option === activeOption)
      const next = event.key === "ArrowDown" ? (index + 1) % enabledOptions.length
        : (index < 0 ? enabledOptions.length - 1 : (index - 1 + enabledOptions.length) % enabledOptions.length)
      setActiveValue(enabledOptions[next]?.value)
    } else if (expanded && (event.key === "Home" || event.key === "End")) {
      event.preventDefault()
      setActiveValue((event.key === "Home" ? enabledOptions[0] : enabledOptions.at(-1))?.value)
    }
  }

  return <div className="searchable-select">
    <input className="searchable-select-input" role="combobox" aria-label={label}
      aria-autocomplete="list" aria-expanded={expanded} aria-controls={listId}
      aria-activedescendant={expanded && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
      autoComplete="off" disabled={disabled} value={expanded ? query : selectedLabel}
      placeholder={expanded && selectedLabel ? selectedLabel : placeholder}
      onFocus={show} onClick={() => { if (!expanded) show() }} onBlur={close}
      onChange={event => {
        setQuery(event.currentTarget.value)
        setActiveValue(undefined)
        setOpen(true)
      }} onKeyDown={handleKeyDown} />
    <span className="searchable-select-chevron" aria-hidden="true">⌄</span>
    {expanded && <ul className="searchable-select-options" id={listId} role="listbox" aria-label={label} ref={listRef}>
      {visibleOptions.map((option, index) => <li key={option.value} id={`${listId}-${index}`} role="option"
        aria-selected={option.value === value} aria-disabled={option.disabled ?? false}
        className={option === activeOption ? "is-active" : undefined}
        onMouseDown={event => event.preventDefault()} onClick={event => {
          // The surrounding label must not activate the input again after selection closes the list.
          event.preventDefault()
          choose(option)
        }}
        onMouseMove={() => { if (!option.disabled) setActiveValue(option.value) }}>{option.label}</li>)}
      {visibleOptions.length === 0 && <li className="searchable-select-empty" role="presentation">无匹配选项</li>}
    </ul>}
  </div>
}
