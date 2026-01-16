"use client"

import React, { createContext, useContext, useState, useEffect } from 'react'

interface HeaderContextType {
    title: string
    setTitle: (title: string) => void
    actions: React.ReactNode
    setActions: (actions: React.ReactNode) => void
}

const HeaderContext = createContext<HeaderContextType | undefined>(undefined)

export function HeaderProvider({ children }: { children: React.ReactNode }) {
    const [title, setTitle] = useState("Overview")
    const [actions, setActions] = useState<React.ReactNode>(null)

    const contextValue = React.useMemo(() => ({
        title, setTitle, actions, setActions
    }), [title, actions])

    return (
        <HeaderContext.Provider value={contextValue}>
            {children}
        </HeaderContext.Provider>
    )
}

export function useHeader(initialTitle?: string, initialActions?: React.ReactNode) {
    const context = useContext(HeaderContext)
    if (!context) {
        throw new Error("useHeader must be used within a HeaderProvider")
    }

    // Effect to set initial values if provided
    useEffect(() => {
        if (initialTitle) context.setTitle(initialTitle)
        if (initialActions) context.setActions(initialActions)

        // Cleanup actions on unmount to avoid stale buttons
        return () => {
            if (initialActions) context.setActions(null)
        }
    }, [initialTitle, initialActions, context])

    return context
}
