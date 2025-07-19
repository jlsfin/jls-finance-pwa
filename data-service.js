// Data Service for CRUD operations with Supabase
import { supabase } from './supabase-config.js'
import { db } from './indexeddb-config.js'

export class DataService {
    constructor() {
        this.isOnline = navigator.onLine
        this.setupNetworkListeners()
    }

    setupNetworkListeners() {
        window.addEventListener('online', () => {
            this.isOnline = true
            this.syncOfflineData()
        })

        window.addEventListener('offline', () => {
            this.isOnline = false
        })
    }

    // Generic CRUD operations
    async create(table, data) {
        try {
            if (this.isOnline) {
                const { data: result, error } = await supabase
                    .from(table)
                    .insert([data])
                    .select()
                    .single()

                if (error) throw error

                // Also save to IndexedDB for offline access
                await db[table].put(result)
                return { success: true, data: result }
            } else {
                // Save to IndexedDB and queue for sync
                const result = await db[table].add(data)
                await db.addToSyncQueue(table, 'create', { ...data, id: result })
                return { success: true, data: { ...data, id: result } }
            }
        } catch (error) {
            console.error(`Error creating ${table}:`, error)
            return { success: false, error: error.message }
        }
    }

    async read(table, filters = {}) {
        try {
            if (this.isOnline) {
                let query = supabase.from(table).select('*')
                
                // Apply filters
                Object.entries(filters).forEach(([key, value]) => {
                    if (value !== undefined && value !== null && value !== '') {
                        query = query.eq(key, value)
                    }
                })

                const { data, error } = await query

                if (error) throw error

                // Update IndexedDB cache
                if (data && data.length > 0) {
                    await db[table].bulkPut(data)
                }

                return { success: true, data: data || [] }
            } else {
                // Read from IndexedDB
                let collection = db[table]
                
                // Apply filters to IndexedDB query
                Object.entries(filters).forEach(([key, value]) => {
                    if (value !== undefined && value !== null && value !== '') {
                        collection = collection.where(key).equals(value)
                    }
                })

                const data = await collection.toArray()
                return { success: true, data }
            }
        } catch (error) {
            console.error(`Error reading ${table}:`, error)
            return { success: false, error: error.message }
        }
    }

    async update(table, id, updates) {
        try {
            if (this.isOnline) {
                const { data, error } = await supabase
                    .from(table)
                    .update(updates)
                    .eq('id', id)
                    .select()
                    .single()

                if (error) throw error

                // Update IndexedDB
                await db[table].update(id, updates)
                return { success: true, data }
            } else {
                // Update IndexedDB and queue for sync
                await db[table].update(id, updates)
                await db.addToSyncQueue(table, 'update', { id, ...updates })
                
                const updated = await db[table].get(id)
                return { success: true, data: updated }
            }
        } catch (error) {
            console.error(`Error updating ${table}:`, error)
            return { success: false, error: error.message }
        }
    }

    async delete(table, id) {
        try {
            if (this.isOnline) {
                const { error } = await supabase
                    .from(table)
                    .delete()
                    .eq('id', id)

                if (error) throw error

                // Delete from IndexedDB
                await db[table].delete(id)
                return { success: true }
            } else {
                // Mark as deleted in IndexedDB and queue for sync
                await db[table].update(id, { _deleted: true })
                await db.addToSyncQueue(table, 'delete', { id })
                return { success: true }
            }
        } catch (error) {
            console.error(`Error deleting ${table}:`, error)
            return { success: false, error: error.message }
        }
    }

    // Customer-specific operations
    async getCustomers(filters = {}) {
        return await this.read('customers', filters)
    }

    async createCustomer(customerData) {
        return await this.create('customers', {
            ...customerData,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        })
    }

    async updateCustomer(id, updates) {
        return await this.update('customers', id, {
            ...updates,
            updated_at: new Date().toISOString()
        })
    }

    async deleteCustomer(id) {
        return await this.delete('customers', id)
    }

    async searchCustomers(searchTerm) {
        try {
            if (this.isOnline) {
                const { data, error } = await supabase
                    .from('customers')
                    .select('*')
                    .or(`name.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`)

                if (error) throw error
                return { success: true, data: data || [] }
            } else {
                const customers = await db.customers.toArray()
                const filtered = customers.filter(customer => 
                    customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    customer.phone.includes(searchTerm) ||
                    (customer.email && customer.email.toLowerCase().includes(searchTerm.toLowerCase()))
                )
                return { success: true, data: filtered }
            }
        } catch (error) {
            console.error('Error searching customers:', error)
            return { success: false, error: error.message }
        }
    }

    // Loan-specific operations
    async getLoans(filters = {}) {
        try {
            if (this.isOnline) {
                const { data, error } = await supabase
                    .from('loans')
                    .select(`
                        *,
                        customers (
                            id,
                            name,
                            phone,
                            email
                        )
                    `)

                if (error) throw error
                return { success: true, data: data || [] }
            } else {
                const loans = await db.loans.toArray()
                const customers = await db.customers.toArray()
                
                // Join with customer data
                const loansWithCustomers = loans.map(loan => ({
                    ...loan,
                    customers: customers.find(c => c.id === loan.customer_id)
                }))
                
                return { success: true, data: loansWithCustomers }
            }
        } catch (error) {
            console.error('Error getting loans:', error)
            return { success: false, error: error.message }
        }
    }

    async createLoan(loanData) {
        return await this.create('loans', {
            ...loanData,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        })
    }

    async updateLoan(id, updates) {
        return await this.update('loans', id, {
            ...updates,
            updated_at: new Date().toISOString()
        })
    }

    async deleteLoan(id) {
        return await this.delete('loans', id)
    }

    // EMI-specific operations
    async getEMIs(filters = {}) {
        try {
            if (this.isOnline) {
                const { data, error } = await supabase
                    .from('emis')
                    .select(`
                        *,
                        loans (
                            id,
                            customer_id,
                            customers (
                                id,
                                name,
                                phone,
                                email
                            )
                        )
                    `)

                if (error) throw error
                return { success: true, data: data || [] }
            } else {
                const emis = await db.emis.toArray()
                const loans = await db.loans.toArray()
                const customers = await db.customers.toArray()
                
                // Join with loan and customer data
                const emisWithDetails = emis.map(emi => {
                    const loan = loans.find(l => l.id === emi.loan_id)
                    const customer = customers.find(c => c.id === loan?.customer_id)
                    
                    return {
                        ...emi,
                        loans: loan ? {
                            ...loan,
                            customers: customer
                        } : null
                    }
                })
                
                return { success: true, data: emisWithDetails }
            }
        } catch (error) {
            console.error('Error getting EMIs:', error)
            return { success: false, error: error.message }
        }
    }

    async createEMI(emiData) {
        return await this.create('emis', {
            ...emiData,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        })
    }

    async updateEMI(id, updates) {
        return await this.update('emis', id, {
            ...updates,
            updated_at: new Date().toISOString()
        })
    }

    async deleteEMI(id) {
        return await this.delete('emis', id)
    }

    async collectEMI(emiId, paymentData = {}) {
        const updates = {
            status: 'paid',
            paid_date: new Date().toISOString().split('T')[0],
            payment_mode: paymentData.payment_mode || 'cash',
            receipt_number: paymentData.receipt_number || `R${emiId}${Date.now()}`,
            updated_at: new Date().toISOString()
        }

        return await this.updateEMI(emiId, updates)
    }

    // User-specific operations
    async getUsers(filters = {}) {
        return await this.read('users', filters)
    }

    async createUser(userData) {
        return await this.create('users', {
            ...userData,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        })
    }

    async updateUser(id, updates) {
        return await this.update('users', id, {
            ...updates,
            updated_at: new Date().toISOString()
        })
    }

    async deleteUser(id) {
        return await this.delete('users', id)
    }

    // Bulk operations for EMI generation
    async createEMISchedule(loanId, emiSchedule) {
        try {
            const results = []
            
            for (const emi of emiSchedule) {
                const result = await this.createEMI({
                    ...emi,
                    loan_id: loanId
                })
                results.push(result)
            }
            
            return { success: true, data: results }
        } catch (error) {
            console.error('Error creating EMI schedule:', error)
            return { success: false, error: error.message }
        }
    }

    // Analytics and reporting
    async getDashboardStats() {
        try {
            const [customersResult, loansResult, emisResult] = await Promise.all([
                this.getCustomers(),
                this.getLoans(),
                this.getEMIs()
            ])

            if (!customersResult.success || !loansResult.success || !emisResult.success) {
                throw new Error('Failed to fetch dashboard data')
            }

            const customers = customersResult.data
            const loans = loansResult.data
            const emis = emisResult.data

            const stats = {
                totalCustomers: customers.length,
                activeLoans: loans.filter(l => l.status === 'active').length,
                totalLoanAmount: loans.reduce((sum, loan) => sum + (loan.principal || 0), 0),
                outstandingEMIs: emis.filter(e => e.status !== 'paid').length,
                outstandingAmount: emis.filter(e => e.status !== 'paid').reduce((sum, emi) => sum + (emi.amount || 0), 0),
                collectedToday: emis.filter(e => e.paid_date === new Date().toISOString().split('T')[0]).reduce((sum, emi) => sum + (emi.amount || 0), 0),
                overdueEMIs: emis.filter(e => new Date(e.due_date) < new Date() && e.status !== 'paid').length
            }

            return { success: true, data: stats }
        } catch (error) {
            console.error('Error getting dashboard stats:', error)
            return { success: false, error: error.message }
        }
    }

    // Sync offline data when connection is restored
    async syncOfflineData() {
        try {
            console.log('Syncing offline data...')
            
            const pendingItems = await db.getPendingSyncItems()
            
            for (const item of pendingItems) {
                try {
                    switch (item.operation) {
                        case 'create':
                            await supabase.from(item.table_name).insert([item.data])
                            break
                        case 'update':
                            await supabase.from(item.table_name).update(item.data).eq('id', item.data.id)
                            break
                        case 'delete':
                            await supabase.from(item.table_name).delete().eq('id', item.data.id)
                            break
                    }
                    
                    await db.markSyncCompleted(item.id)
                } catch (error) {
                    console.error('Error syncing item:', item, error)
                }
            }
            
            // Clean up completed sync items
            await db.clearCompletedSyncItems()
            
            console.log('Offline data sync completed')
            return { success: true }
        } catch (error) {
            console.error('Error syncing offline data:', error)
            return { success: false, error: error.message }
        }
    }

    // File upload to Supabase Storage
    async uploadFile(bucket, path, file) {
        try {
            const { data, error } = await supabase.storage
                .from(bucket)
                .upload(path, file)

            if (error) throw error

            const { data: { publicUrl } } = supabase.storage
                .from(bucket)
                .getPublicUrl(path)

            return { success: true, url: publicUrl, path: data.path }
        } catch (error) {
            console.error('Error uploading file:', error)
            return { success: false, error: error.message }
        }
    }

    // Get file URL from Supabase Storage
    getFileUrl(bucket, path) {
        const { data: { publicUrl } } = supabase.storage
            .from(bucket)
            .getPublicUrl(path)
        
        return publicUrl
    }
}

// Create singleton instance
export const dataService = new DataService()

