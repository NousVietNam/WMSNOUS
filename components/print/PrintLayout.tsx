"use client"

import React from "react"
import { cn } from "@/lib/utils"

interface PrintLayoutProps {
    children: React.ReactNode
    className?: string
    width?: string
    height?: string
}

export function PrintLayout({
    children,
    className,
    width = "100mm",
    height = "150mm",
}: PrintLayoutProps) {
    return (
        <>
            <style jsx global>{`
        @media print {
          @page {
            size: ${width} ${height};
            margin: 0;
          }
          body {
            margin: 0;
            padding: 0;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          /* Hide everything else */
          body > *:not(.print-container) {
            display: none !important;
          }
          /* Make sure the print container is visible */
          .print-container {
            display: flex !important;
            position: fixed;
            top: 0;
            left: 0;
            width: ${width};
            height: ${height};
            margin: 0;
            padding: 0;
            background: white;
            z-index: 9999;
          }
        }
      `}</style>
            <div
                className={cn(
                    "print-container flex flex-col items-center justify-center text-center bg-white border border-gray-200 shadow-sm print:shadow-none print:border-none mx-auto overflow-hidden",
                    className
                )}
                style={{
                    width: width,
                    height: height
                }}
            >
                {children}
            </div>
        </>
    )
}
