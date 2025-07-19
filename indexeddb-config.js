// IndexedDB Configuration using Dexie
import Dexie from 'dexie'

export class JLSFinanceDB extends Dexie {
    constructor() {
        super('JLSFinanceDB')
        
        this.version(1).stores({
            customers: '++id, name, phone, email, address, city, state, pincode, status, created_at',
            loans: 'id, customer_id, principal, interest_rate, tenure, emi_amount, status, disbursed_date',
            emis: '++id, loan_id, emi_number, amount, due_date, paid_date, status',
            users: '++id, name, email, phone, role, status',
            sync_queue: '++id, table_name, operation, data, timestamp, synced',
            app_settings: 'key, value'
        })

        // Define table references
        this.customers = this.table('customers')
        this.loans = this.table('loans')
        this.emis = this.table('emis')
        this.users = this.table('users')
        this.sync_queue = this.table('sync_queue')
        this.app_settings = this.table('app_settings')
    }

    // Add item to sync queue for offline operations
    async addToSyncQueue(tableName, operation, data) {
        return await this.sync_queue.add({
            table_name: tableName,
            operation: operation, // 'create', 'update', 'delete'
            data: data,
            timestamp: new Date(),
            synced: false
        })
    }

    // Get pending sync items
    async getPendingSyncItems() {
        return await this.sync_queue.where('synced').equals(false).toArray()
    }

    // Mark sync item as completed
    async markSyncCompleted(id) {
        return await this.sync_queue.update(id, { synced: true })
    }

    // Clear completed sync items
    async clearCompletedSyncItems() {
        return await this.sync_queue.where('synced').equals(true).delete()
    }

    // Initialize with demo data
    async initializeDemoData() {
        const customerCount = await this.customers.count()
        
        if (customerCount === 0) {
            // Add demo customers
            await this.customers.bulkAdd([
                {
                    id: 1,
                    name: 'राहुल शर्मा',
                    phone: '+91-9876543210',
                    email: 'rahul@example.com',
                    address: 'House No. 123, MG Road, Delhi',
                    city: 'Delhi',
                    state: 'Delhi',
                    pincode: '110001',
                    status: 'active',
                    created_at: '2024-01-15'
                },
                {
                    id: 2,
                    name: 'प्रिया पटेल',
                    phone: '+91-9876543211',
                    email: 'priya@example.com',
                    address: 'Flat 456, Satellite Road, Ahmedabad',
                    city: 'Ahmedabad',
                    state: 'Gujarat',
                    pincode: '380015',
                    status: 'active',
                    created_at: '2024-01-20'
                },
                {
                    id: 3,
                    name: 'अमित कुमार',
                    phone: '+91-9876543212',
                    email: 'amit@example.com',
                    address: '789 Park Street, Mumbai',
                    city: 'Mumbai',
                    state: 'Maharashtra',
                    pincode: '400001',
                    status: 'active',
                    created_at: '2024-02-01'
                }
            ])

            // Add demo loans
            await this.loans.bulkAdd([
                {
                    id: 'L001',
                    customer_id: 1,
                    principal: 50000,
                    interest_rate: 12.5,
                    tenure: 12,
                    processing_fee: 500,
                    status: 'active',
                    disbursed_date: '2024-01-20',
                    emi_amount: 4454
                },
                {
                    id: 'L002',
                    customer_id: 2,
                    principal: 75000,
                    interest_rate: 13.0,
                    tenure: 18,
                    processing_fee: 750,
                    status: 'active',
                    disbursed_date: '2024-01-25',
                    emi_amount: 4722
                },
                {
                    id: 'L003',
                    customer_id: 3,
                    principal: 100000,
                    interest_rate: 12.0,
                    tenure: 24,
                    processing_fee: 1000,
                    status: 'active',
                    disbursed_date: '2024-02-05',
                    emi_amount: 4707
                }
            ])

            // Add demo EMIs
            await this.emis.bulkAdd([
                {
                    id: 1,
                    loan_id: 'L001',
                    emi_number: 1,
                    amount: 4454,
                    due_date: '2024-02-20',
                    paid_date: '2024-02-18',
                    status: 'paid'
                },
                {
                    id: 2,
                    loan_id: 'L001',
                    emi_number: 2,
                    amount: 4454,
                    due_date: '2024-03-20',
                    status: 'overdue'
                },
                {
                    id: 3,
                    loan_id: 'L002',
                    emi_number: 1,
                    amount: 4722,
                    due_date: '2024-02-25',
                    paid_date: '2024-02-25',
                    status: 'paid'
                },
                {
                    id: 4,
                    loan_id: 'L002',
                    emi_number: 2,
                    amount: 4722,
                    due_date: '2024-03-25',
                    status: 'due'
                }
            ])

            // Add demo users
            await this.users.bulkAdd([
                {
                    id: 1,
                    name: 'Admin User',
                    email: 'admin@jls.com',
                    phone: '+91-9999999999',
                    role: 'admin'
                },
                {
                    id: 2,
                    name: 'Agent User',
                    email: 'agent@jls.com',
                    phone: '+91-8888888888',
                    role: 'agent'
                },
                {
                    id: 3,
                    name: 'Customer User',
                    email: 'customer@jls.com',
                    phone: '+91-7777777777',
                    role: 'customer'
                }
            ])

            console.log('Demo data initialized in IndexedDB')
        }
    }
}

// Create database instance
export const db = new JLSFinanceDB()

