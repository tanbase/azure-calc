// ============================================================
// Azure VM Pricing Calculator - Custom Dropdown Component
// ============================================================

import React, { useRef, useEffect, useState, useLayoutEffect, useCallback } from 'react';

export interface DropdownOption {
  value: string;
  label: string;
  subtext?: string;
}

interface CustomDropdownProps {
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  renderOption?: (option: DropdownOption) => React.ReactNode;
}

export const CustomDropdown: React.FC<CustomDropdownProps> = React.memo(({
  options,
  value,
  onChange,
  placeholder,
  className = '',
  renderOption,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const optionRefs = useRef<(HTMLLIElement | null)[]>([]);

  const selectedOption = options.find((o) => o.value === value);
  const displayText = selectedOption?.label || placeholder || '';
  const displaySubtext = selectedOption?.subtext;

  const calculateMenuPosition = useCallback(() => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      return {
        position: 'fixed',
        top: rect.bottom + 4,
        left: rect.left,
        minWidth: rect.width,
        zIndex: 9999,
      } as React.CSSProperties;
    }
    return {};
  }, []);

  const toggleDropdown = useCallback(() => {
    const nextOpen = !isOpen;
    if (nextOpen) {
      setMenuStyle(calculateMenuPosition());
      setHighlightedIndex(options.findIndex((o) => o.value === value));
    }
    setIsOpen(nextOpen);
  }, [isOpen, calculateMenuPosition, options, value]);

  // Use useLayoutEffect for position recalculation to avoid flash
  useLayoutEffect(() => {
    if (!isOpen) return;
    // Positioning is an imperative side effect that must happen synchronously before paint
    // to avoid visual flash. This follows the React docs guidance for imperative measurements.
    setMenuStyle(calculateMenuPosition());
  }, [isOpen, calculateMenuPosition]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node) &&
        menuRef.current &&
        !menuRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    // Throttled scroll handler with mounted guard
    let scrollTimer: ReturnType<typeof setTimeout>;
    let isMounted = true;
    const handleScroll = () => {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        if (isMounted) {
          setMenuStyle(calculateMenuPosition());
        }
      }, 16);
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleScroll);
    return () => {
      isMounted = false;
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleScroll);
      clearTimeout(scrollTimer);
    };
  }, [isOpen, calculateMenuPosition]);

  const handleSelect = useCallback((optionValue: string) => {
    onChange(optionValue);
    setIsOpen(false);
  }, [onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleDropdown();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev + 1) % options.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev - 1 + options.length) % options.length);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        handleSelect(options[highlightedIndex]?.value);
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        triggerRef.current?.focus();
        break;
      case 'Tab':
        setIsOpen(false);
        break;
    }
  }, [isOpen, options, highlightedIndex, toggleDropdown, handleSelect]);

  // Scroll highlighted option into view
  useEffect(() => {
    if (isOpen && optionRefs.current[highlightedIndex]) {
      optionRefs.current[highlightedIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex, isOpen]);

  return (
    <div
      className={`custom-dropdown ${className} ${isOpen ? 'open' : ''}`}
      onKeyDown={handleKeyDown}
    >
      <button
        ref={triggerRef}
        type="button"
        className={`custom-dropdown-trigger${className?.includes('settings-dropdown') ? ' region-trigger' : ''}`}
        onClick={toggleDropdown}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span className="custom-dropdown-value">
          {displayText}
          {displaySubtext && <span className="custom-dropdown-subtext">{displaySubtext}</span>}
        </span>
        <svg
          className={`custom-dropdown-chevron ${isOpen ? 'rotated' : ''}`}
          viewBox="0 0 24 24"
          width="16"
          height="16"
          aria-hidden="true"
        >
          <path
            d="M6 9l6 6 6-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {isOpen && (
        <ul
          ref={menuRef}
          className="custom-dropdown-menu"
          style={menuStyle}
          role="listbox"
          aria-label={placeholder || 'Select an option'}
        >
          {options.map((option, index) => (
            <li
              key={option.value}
              ref={(el) => { optionRefs.current[index] = el; }}
              className={`custom-dropdown-option ${option.value === value ? 'selected' : ''} ${index === highlightedIndex ? 'highlighted' : ''}`}
              onClick={() => handleSelect(option.value)}
              role="option"
              aria-selected={option.value === value}
              tabIndex={-1}
            >
              {renderOption ? renderOption(option) : (
                <>
                  <span className="option-label">{option.label}</span>
                  {option.value === value && (
                    <svg className="check-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                      <path
                        d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"
                        fill="currentColor"
                      />
                    </svg>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});
