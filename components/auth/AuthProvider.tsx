"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { Session } from "@supabase/supabase-js"

interface AuthContextType {
    session: Session | null
    userRole: string | null // Changed from strict 'ADMN' | 'STAFF' to string to support dynamic roles
    permissions: any // JSON object
    loading: boolean
    signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
    session: null,
    userRole: null,
    permissions: {},
    loading: true,
    signOut: async () => { },
})

export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [session, setSession] = useState<Session | null>(null)
    const [userRole, setUserRole] = useState<string | null>(null)
    const [permissions, setPermissions] = useState<any>({})
    const [loading, setLoading] = useState(true)
    const router = useRouter()
    const pathname = usePathname()

    // Define public routes
    const isPublicRoute = pathname === '/login' || pathname === '/admin/seed' || pathname?.startsWith('/forgot-password') || pathname?.startsWith('/reset-password')

    useEffect(() => {
        // 1. Initial Session Check
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session)
            if (session) fetchUserRoleAndPermissions(session.user.id)
            else setLoading(false)
        })

        // 2. Listen for Auth Changes
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session)
            if (session) fetchUserRoleAndPermissions(session.user.id)
            else {
                setUserRole(null)
                setPermissions({})
                setLoading(false)
            }
        })

        return () => subscription.unsubscribe()
    }, [])

    async function fetchUserRoleAndPermissions(userId: string) {
        try {
            // 1. Get User Role Code from users table
            let { data: user, error } = await supabase
                .from('users')
                .select('role')
                .eq('id', userId)
                .single()

            if (error || !user) {
                console.warn("User role not found in DB, defaulting to STAFF")
                setUserRole('STAFF')
                setPermissions({})
                setLoading(false)
                return
            }

            const roleCode = user.role ? user.role.toUpperCase() : 'STAFF'
            setUserRole(roleCode)

            // 2. Get Permissions for this Role
            // Need to join via roles table: roles.code -> roles.id -> role_permissions.role_id
            const { data: roleData } = await supabase
                .from('roles')
                .select('id')
                .eq('code', roleCode)
                .single()

            if (roleData) {
                const { data: permData } = await supabase
                    .from('role_permissions')
                    .select('permissions')
                    .eq('role_id', roleData.id)
                    .single()

                if (permData) {
                    setPermissions(permData.permissions || {})
                }
            } else {
                // Backward compatibility: If Role table is empty but User has ADMIN/STAFF
                if (roleCode === 'ADMIN') setPermissions({ ALL: true })
                else setPermissions({
                    MOBILE_PICKING: true,
                    MOBILE_PUTAWAY: true,
                    MOBILE_LOOKUP: true
                })
            }

        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }

    // 4. Route Protection Logic
    useEffect(() => {
        if (loading) return

        // Not Logged In -> Redirect to Login
        if (!session && !isPublicRoute) {
            router.push('/login')
            return
        }

        // Logged In but on Public Page -> Redirect to Main App
        if (session && isPublicRoute && pathname !== '/admin/seed') {
            // If ADMIN, go to root (or admin dashboard). If STAFF/Others, go to mobile
            if (userRole === 'ADMIN') router.push('/')
            else router.push('/mobile')
            return
        }

        // Logged In and accessing Admin Page -> Check Role
        // If Role is NOT ADMIN, kick them out to mobile
        if (session && pathname?.startsWith('/admin') && userRole !== 'ADMIN') {
            router.push('/mobile')
        }

    }, [session, loading, pathname, userRole, isPublicRoute, router])

    const signOut = async () => {
        await supabase.auth.signOut()
        router.push('/login')
    }

    return (
        <AuthContext.Provider value={{ session, userRole, permissions, loading, signOut }}>
            {!loading && children}
            {loading && (
                <div className="min-h-screen flex items-center justify-center bg-slate-50 flex-col gap-4">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
                    <p className="text-slate-500 animate-pulse">Đang tải dữ liệu...</p>
                </div>
            )}
        </AuthContext.Provider>
    )
}

