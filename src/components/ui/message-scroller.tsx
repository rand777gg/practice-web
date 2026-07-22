"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import {
  MessageScroller as MessageScrollerPrimitive,
  useMessageScroller,
  useMessageScrollerScrollable,
} from "@shadcn/react/message-scroller"

function MessageScrollerProvider(
  props: React.ComponentProps<typeof MessageScrollerPrimitive.Provider>
) {
  return <MessageScrollerPrimitive.Provider {...props} />
}

function MessageScrollerRoot({
  className,
  ...props
}: React.ComponentProps<typeof MessageScrollerPrimitive.Root>) {
  return (
    <MessageScrollerPrimitive.Root
      className={cn("flex flex-col overflow-hidden", className)}
      {...props}
    />
  )
}

const MessageScrollerViewport = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<typeof MessageScrollerPrimitive.Viewport>
>(({ className, ...props }, ref) => (
  <MessageScrollerPrimitive.Viewport
    ref={ref}
    className={cn("flex-1 overflow-y-auto", className)}
    {...props}
  />
))
MessageScrollerViewport.displayName = "MessageScrollerViewport"

const MessageScrollerContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<typeof MessageScrollerPrimitive.Content>
>(({ className, ...props }, ref) => (
  <MessageScrollerPrimitive.Content
    ref={ref}
    className={cn("flex flex-col gap-3 p-4", className)}
    {...props}
  />
))
MessageScrollerContent.displayName = "MessageScrollerContent"

const MessageScrollerItem = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<typeof MessageScrollerPrimitive.Item>
>(({ className, ...props }, ref) => (
  <MessageScrollerPrimitive.Item
    ref={ref}
    className={cn("", className)}
    {...props}
  />
))
MessageScrollerItem.displayName = "MessageScrollerItem"

function MessageScrollerButton({
  className,
  direction = "end",
  children,
  ...props
}: React.ComponentProps<typeof MessageScrollerPrimitive.Button>) {
  return (
    <MessageScrollerPrimitive.Button
      direction={direction}
      className={cn(
        "absolute z-10 rounded-full bg-background border shadow-md p-1.5 hover:bg-accent transition-colors",
        direction === "end" ? "bottom-3 right-3" : "top-3 right-3 rotate-180",
        className
      )}
      {...props}
    >
      {children ?? (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 5v14" />
          <path d="m19 12-7 7-7-7" />
        </svg>
      )}
    </MessageScrollerPrimitive.Button>
  )
}

export {
  MessageScrollerProvider,
  MessageScrollerRoot,
  MessageScrollerViewport,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerButton,
  useMessageScroller,
  useMessageScrollerScrollable,
}
