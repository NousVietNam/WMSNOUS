"use client"

import React from "react"
import { Box } from "lucide-react"
import { Card } from "@/components/ui/card"

const WarehouseNode = ({ x, y, status }: { x: number, y: number, status: 'idle' | 'busy' | 'error' }) => {
    // Determine color based on status
    const color = status === 'busy' ? 'bg-blue-500 shadow-blue-500/80' :
        status === 'error' ? 'bg-red-500 shadow-red-500/80' : 'bg-emerald-400 shadow-emerald-400/80'

    return (
        <div
            className={`absolute h-5 w-5 rounded-full ${color} shadow-lg ring-4 ring-white/30 transition-all duration-1000 transform hover:scale-150 cursor-pointer z-20`}
            style={{ left: `${x}%`, top: `${y}%` }}
        >
            <div className={`absolute -inset-4 rounded-full border-2 ${status === 'busy' ? 'border-blue-400' : 'border-emerald-400'} opacity-20 animate-ping`}></div>
        </div>
    )
}

export function Warehouse3DMap({ className }: { className?: string }) {
    return (
        <div className={`relative perspective-[1200px] w-full h-full min-h-[500px] ${className}`}>
            {/* Map Container - The 3D Base */}
            <div className="absolute inset-0 rounded-[40px] transform-style-preserve-3d transition-transform duration-700 hover:rotate-x-[15deg] hover:rotate-y-[5deg] shadow-[0_30px_60px_-15px_rgba(0,0,0,0.1)] border-4 border-white/30 bg-gradient-to-br from-white/40 to-white/10 backdrop-blur-md overflow-hidden group/map w-full h-full">

                {/* Floor Texture */}
                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-30 z-0"></div>
                <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>

                {/* Shelves & Paths (Mockup) - Floating Elements */}
                <div className="relative w-full h-full p-8 z-10 transform-style-preserve-3d perspective-[1000px]">

                    {/* 3D Shelf 1 */}
                    <div className="absolute top-[15%] left-[5%] w-[140px] h-[100px] bg-slate-50/90 border border-white/60 rounded-xl shadow-[15px_15px_35px_rgba(0,0,0,0.1)] transform rotate-y-[12deg] translate-z-[40px] transition-transform duration-500 group-hover/map:translate-z-[60px]">
                        <div className="absolute inset-0 grid grid-cols-4 gap-1 p-2 bg-indigo-50/30 rounded-xl">
                            {[...Array(16)].map((_, i) => <div key={i} className="bg-indigo-300/20 rounded-sm shadow-inner border border-white/20"></div>)}
                        </div>
                        {/* 3D Thickness Fake */}
                        <div className="absolute -right-2 top-2 bottom-2 w-2 bg-slate-300/50 blur-[1px] rounded-r-md"></div>
                        <div className="absolute -bottom-2 left-2 right-2 h-2 bg-slate-300/50 blur-[1px] rounded-b-md"></div>
                    </div>

                    {/* 3D Shelf 2 */}
                    <div className="absolute top-[15%] left-[45%] w-[140px] h-[100px] bg-slate-50/90 border border-white/60 rounded-xl shadow-[15px_15px_35px_rgba(0,0,0,0.1)] transform rotate-y-[12deg] translate-z-[30px] transition-transform duration-500 group-hover/map:translate-z-[50px]">
                        <div className="absolute inset-0 grid grid-cols-4 gap-1 p-2 bg-indigo-50/30 rounded-xl">
                            {[...Array(16)].map((_, i) => <div key={i} className="bg-indigo-300/20 rounded-sm shadow-inner border border-white/20"></div>)}
                        </div>
                    </div>

                    {/* 3D Shelf 3 */}
                    <div className="absolute top-[20%] right-[5%] w-[120px] h-[90px] bg-slate-50/90 border border-white/60 rounded-xl shadow-[15px_15px_35px_rgba(0,0,0,0.1)] transform rotate-[-8deg] translate-z-[20px] transition-transform duration-500 group-hover/map:translate-z-[40px]">
                        <div className="absolute inset-0 grid grid-cols-4 gap-1 p-2 bg-emerald-50/30 rounded-xl">
                            {[...Array(12)].map((_, i) => <div key={i} className="bg-emerald-300/20 rounded-sm shadow-inner border border-white/20"></div>)}
                        </div>
                    </div>

                    {/* Glowing Paths */}
                    <svg className="absolute inset-0 w-full h-full pointer-events-none z-0 filter drop-shadow-[0_0_8px_rgba(99,102,241,0.4)] opacity-70">
                        <path d="M 80 200 H 260 V 350 H 500" fill="none" stroke="#60A5FA" strokeWidth="4" strokeLinecap="round" strokeDasharray="1 10" className="animate-dash" />
                        <path d="M 300 150 V 400" fill="none" stroke="#34D399" strokeWidth="3" strokeLinecap="round" strokeDasharray="6 6" />
                    </svg>

                    {/* Moving Nodes (Robots) */}
                    <WarehouseNode x={20} y={50} status="busy" />
                    <WarehouseNode x={50} y={40} status="idle" />
                    <WarehouseNode x={70} y={70} status="error" />

                    {/* Floating Status Card - Super 3D */}
                    <Card className="absolute top-[45%] right-[15%] !p-5 w-60 shadow-[30px_30px_80px_rgba(0,0,0,0.15)] animate-float transform rotate-y-[-12deg] rotate-x-[8deg] bg-white/60 backdrop-blur-3xl border-white/80 z-50">
                        <div className="flex gap-4 mb-4">
                            <div className="h-12 w-12 bg-slate-900 rounded-2xl text-white flex items-center justify-center shadow-xl shadow-slate-900/30"><Box size={20} strokeWidth={2.5} /></div>
                            <div>
                                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Automated</div>
                                <div className="text-base font-black text-slate-800">AMR-01.X</div>
                            </div>
                        </div>
                        <div className="flex justify-between items-center text-xs font-bold text-slate-500 mb-2 uppercase tracking-wide">
                            <span>Battery</span>
                            <span className="text-emerald-600">85%</span>
                        </div>
                        <div className="w-full bg-slate-200/80 h-2.5 rounded-full mb-4 overflow-hidden border border-white/50">
                            <div className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 w-[85%] rounded-full shadow-[0_0_15px_#10B981]"></div>
                        </div>
                        <div className="flex gap-2">
                            <button className="flex-1 py-2 text-xs font-bold bg-white shadow-sm border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600 transition-colors">Recall</button>
                            <button className="flex-1 py-2 text-xs font-bold bg-slate-900 shadow-lg shadow-slate-900/20 text-white rounded-xl hover:bg-slate-800 transition-colors">Emergency</button>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    )
}
