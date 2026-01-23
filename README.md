# WMS Application - Interactive Warehouse Map

Advanced warehouse management system with a high-performance interactive 2D/3D map.

## Key Features

- **Dynamic Map**: Render thousands of racks with smooth performance using Canvas/WebGL.
- **Interactive Editing**: Move, Resize, and Create racks or map elements (walls, doors) in real-time.
- **Multi-Selection**: Lasso selection and Ctrl-click for batch operations.
- **Detailed Layouts**: Manage inventory levels and locations directly through the map interface.
- **3D Visualization**: Switch between 2D planning and 3D preview of the warehouse.

## Map Interactions

| Action | Control |
|--------|---------|
| **Select / View** | Left Click |
| **Pan Map** | Right Click / Middle Click Drag |
| **Zoom** | Mouse Scroll |
| **Lasso Selection** | Shift + Left Click Drag (Edit Mode) |
| **Multi-Select** | Ctrl + Left Click |
| **Move Group** | Drag any selected rack |

## Tech Stack

- **Frontend**: Next.js (App Router), React, Lucide-React
- **State Management**: React Hooks (useState, useRef, useCallback)
- **Styling**: Tailwind CSS
- **Visualization**: HTML5 Canvas, React Three Fiber (3D)

## Setup

1. Install dependencies: `npm install`
2. Run development server: `npm run dev`
3. Build for production: `npm run build`
