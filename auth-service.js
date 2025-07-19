// Authentication Service with Supabase and Phone Login
import { supabase } from './supabase-config.js'

export class AuthService {
    constructor() {
        this.currentUser = null
        this.authListeners = []
        this.init()
    }

    async init() {
        // Check for existing session
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
            await this.setCurrentUser(session.user)
        }

        // Listen for auth changes
        supabase.auth.onAuthStateChange(async (event, session) => {
            console.log('Auth state changed:', event, session)
            
            if (event === 'SIGNED_IN' && session) {
                await this.setCurrentUser(session.user)
            } else if (event === 'SIGNED_OUT') {
                this.currentUser = null
                this.notifyAuthListeners(null)
            }
        })
    }

    async setCurrentUser(user) {
        // Get user profile from our users table
        const { data: userProfile, error } = await supabase
            .from('users')
            .select('*')
            .eq('email', user.email)
            .single()

        if (userProfile) {
            this.currentUser = {
                ...user,
                ...userProfile
            }
        } else {
            // Create user profile if doesn't exist
            const newUserProfile = {
                name: user.user_metadata?.name || user.email.split('@')[0],
                email: user.email,
                phone: user.phone || user.user_metadata?.phone || '',
                role: 'agent', // Default role
                status: 'active'
            }

            const { data: createdProfile, error: createError } = await supabase
                .from('users')
                .insert([newUserProfile])
                .select()
                .single()

            if (createdProfile) {
                this.currentUser = {
                    ...user,
                    ...createdProfile
                }
            }
        }

        this.notifyAuthListeners(this.currentUser)
    }

    // Email/Password Login
    async loginWithEmail(email, password) {
        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password
            })

            if (error) throw error

            return { success: true, user: data.user }
        } catch (error) {
            console.error('Email login error:', error)
            return { success: false, error: error.message }
        }
    }

    // Phone Number Login (using email format: phone@jls.com)
    async loginWithPhone(phone, password) {
        try {
            // Convert phone to email format
            const email = `${phone.replace(/[^0-9]/g, '')}@jls.com`
            
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password
            })

            if (error) throw error

            return { success: true, user: data.user }
        } catch (error) {
            console.error('Phone login error:', error)
            return { success: false, error: error.message }
        }
    }

    // Register new user with phone
    async registerWithPhone(userData) {
        try {
            const { name, phone, password, role = 'agent' } = userData
            const email = `${phone.replace(/[^0-9]/g, '')}@jls.com`

            // Create auth user
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        name,
                        phone
                    }
                }
            })

            if (authError) throw authError

            // Create user profile
            const { data: profileData, error: profileError } = await supabase
                .from('users')
                .insert([{
                    name,
                    email,
                    phone,
                    role,
                    status: 'active'
                }])
                .select()
                .single()

            if (profileError) throw profileError

            return { success: true, user: authData.user, profile: profileData }
        } catch (error) {
            console.error('Registration error:', error)
            return { success: false, error: error.message }
        }
    }

    // OTP Login for phone numbers
    async sendOTP(phone) {
        try {
            const { data, error } = await supabase.auth.signInWithOtp({
                phone,
                options: {
                    shouldCreateUser: false
                }
            })

            if (error) throw error

            return { success: true, data }
        } catch (error) {
            console.error('OTP send error:', error)
            return { success: false, error: error.message }
        }
    }

    async verifyOTP(phone, token) {
        try {
            const { data, error } = await supabase.auth.verifyOtp({
                phone,
                token,
                type: 'sms'
            })

            if (error) throw error

            return { success: true, user: data.user }
        } catch (error) {
            console.error('OTP verify error:', error)
            return { success: false, error: error.message }
        }
    }

    // Demo login (for testing)
    async demoLogin(role = 'admin') {
        const demoCredentials = {
            admin: { email: 'admin@jls.com', password: 'admin123' },
            agent: { email: 'agent@jls.com', password: 'agent123' },
            customer: { email: 'customer@jls.com', password: 'customer123' }
        }

        const credentials = demoCredentials[role]
        if (!credentials) {
            return { success: false, error: 'Invalid demo role' }
        }

        return await this.loginWithEmail(credentials.email, credentials.password)
    }

    // Logout
    async logout() {
        try {
            const { error } = await supabase.auth.signOut()
            if (error) throw error

            this.currentUser = null
            this.notifyAuthListeners(null)
            return { success: true }
        } catch (error) {
            console.error('Logout error:', error)
            return { success: false, error: error.message }
        }
    }

    // Get current user
    getCurrentUser() {
        return this.currentUser
    }

    // Check if user is authenticated
    isAuthenticated() {
        return !!this.currentUser
    }

    // Check user role
    hasRole(role) {
        return this.currentUser?.role === role
    }

    // Check if user has permission
    hasPermission(permission) {
        const rolePermissions = {
            admin: ['read', 'write', 'delete', 'manage_users', 'view_reports'],
            agent: ['read', 'write', 'collect_emi'],
            customer: ['read_own']
        }

        const userRole = this.currentUser?.role
        return rolePermissions[userRole]?.includes(permission) || false
    }

    // Add auth state listener
    addAuthListener(callback) {
        this.authListeners.push(callback)
    }

    // Remove auth state listener
    removeAuthListener(callback) {
        this.authListeners = this.authListeners.filter(listener => listener !== callback)
    }

    // Notify all auth listeners
    notifyAuthListeners(user) {
        this.authListeners.forEach(callback => callback(user))
    }

    // Update user profile
    async updateProfile(updates) {
        try {
            if (!this.currentUser) {
                throw new Error('No authenticated user')
            }

            const { data, error } = await supabase
                .from('users')
                .update(updates)
                .eq('id', this.currentUser.id)
                .select()
                .single()

            if (error) throw error

            // Update current user
            this.currentUser = { ...this.currentUser, ...data }
            this.notifyAuthListeners(this.currentUser)

            return { success: true, user: this.currentUser }
        } catch (error) {
            console.error('Profile update error:', error)
            return { success: false, error: error.message }
        }
    }

    // Change password
    async changePassword(newPassword) {
        try {
            const { data, error } = await supabase.auth.updateUser({
                password: newPassword
            })

            if (error) throw error

            return { success: true }
        } catch (error) {
            console.error('Password change error:', error)
            return { success: false, error: error.message }
        }
    }

    // Reset password
    async resetPassword(email) {
        try {
            const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/reset-password`
            })

            if (error) throw error

            return { success: true }
        } catch (error) {
            console.error('Password reset error:', error)
            return { success: false, error: error.message }
        }
    }
}

// Create singleton instance
export const authService = new AuthService()

