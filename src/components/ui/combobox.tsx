"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Check, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface ComboboxOption {
  value: string;
  label: string;
  searchText?: string;
}

interface ComboboxProps {
  options: ComboboxOption[];
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  className?: string;
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Select an option",
  searchPlaceholder = "Search...",
  emptyMessage = "No option found.",
  disabled = false,
  className,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  const selectedOption = options.find(
    (option) => option.value === value
  );

  const filteredOptions = React.useMemo(() => {
    const searchValue = search.trim().toLowerCase();

    if (!searchValue) {
      return options;
    }

    return options.filter((option) => {
      const text = [
        option.value,
        option.label,
        option.searchText || "",
      ]
        .join(" ")
        .toLowerCase();

      return text.includes(searchValue);
    });
  }, [options, search]);

  function handleOpenChange(next: boolean) {
    setOpen(next);

    if (next) {
      setSearch("");
      setTimeout(() => searchInputRef.current?.focus(), 0);
    }
  }

  function handleSelect(option: ComboboxOption) {
    onChange(option.value);
    setOpen(false);
    setSearch("");
  }

  // Dialog's modal scroll-lock intercepts wheel events on anything
  // portaled outside its own DOM subtree (like this Popover.Content,
  // which portals straight to <body>) and calls preventDefault() on
  // them. That blocks the browser's native wheel-to-scroll behavior,
  // but it doesn't stop us moving scrollTop ourselves, so we do that
  // manually here to route around the lock.
  function handleWheel(event: React.WheelEvent<HTMLDivElement>) {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop += event.deltaY;
  }

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <PopoverPrimitive.Trigger asChild disabled={disabled}>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "min-w-0 justify-between font-normal",
            className
          )}
        >
          <span className="min-w-0 truncate">
            {selectedOption?.label || placeholder}
          </span>

          <ChevronDown
            className={cn(
              "ml-2 h-4 w-4 shrink-0 opacity-50 transition-transform",
              open && "rotate-180"
            )}
          />
        </Button>
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          style={{ width: "var(--radix-popover-trigger-width)" }}
          className="z-50 overflow-hidden rounded-md border bg-background shadow-md"
        >
          <div className="p-2">
            <Input
              ref={searchInputRef}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={searchPlaceholder}
              className="h-8"
            />
          </div>

          <div
            ref={listRef}
            onWheel={handleWheel}
            className="max-h-60 overflow-y-auto overflow-x-hidden border-t overscroll-contain"
          >
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                {emptyMessage}
              </div>
            ) : (
              <div className="p-1">
                {filteredOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleSelect(option)}
                    className="flex w-full min-w-0 items-center rounded-sm px-2 py-2 text-left text-sm hover:bg-secondary"
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4 shrink-0",
                        value === option.value
                          ? "opacity-100"
                          : "opacity-0"
                      )}
                    />

                    <span className="min-w-0 truncate">
                      {option.label}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}