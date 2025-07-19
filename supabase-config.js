
// Supabase Configuration
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://yssjbqarqgsmmctfdgka.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlzc2picWFycWdzbW1jdGZkZ2thIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI5MDk0MzIsImV4cCI6MjA2ODQ4NTQzMn0.nQ_BQ0os5hX8aksOzRtGgrozNrYpZJOUAb5qL2qdRe0'

export const supabase = createClient(supabaseUrl, supabaseKey)

export const createTableSQL = {
    customers: `
        CREATE TABLE IF NOT EXISTS customers (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            phone VARCHAR(20) UNIQUE NOT NULL,
            email VARCHAR(255),
            address TEXT NOT NULL,
            city VARCHAR(100) NOT NULL,
            state VARCHAR(100) NOT NULL,
            pincode VARCHAR(10) NOT NULL,
            dob DATE,
            gender VARCHAR(10),
            occupation VARCHAR(100),
            aadhaar_url TEXT,
            pan_url TEXT,
            photo_url TEXT,
            nominee_name VARCHAR(255),
            nominee_relationship VARCHAR(100),
            nominee_phone VARCHAR(20),
            nominee_age INTEGER,
            status VARCHAR(20) DEFAULT 'active',
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        );
    `,
    loans: `
        CREATE TABLE IF NOT EXISTS loans (
            id VARCHAR(20) PRIMARY KEY,
            customer_id INTEGER REFERENCES customers(id),
            principal DECIMAL(12,2) NOT NULL,
            interest_rate DECIMAL(5,2) NOT NULL,
            tenure INTEGER NOT NULL,
            processing_fee DECIMAL(10,2) DEFAULT 0,
            purpose VARCHAR(100),
            remarks TEXT,
            emi_amount DECIMAL(10,2) NOT NULL,
            status VARCHAR(20) DEFAULT 'pending',
            disbursed_date DATE,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        );
    `,
    emis: `
        CREATE TABLE IF NOT EXISTS emis (
            id SERIAL PRIMARY KEY,
            loan_id VARCHAR(20) REFERENCES loans(id),
            emi_number INTEGER NOT NULL,
            amount DECIMAL(10,2) NOT NULL,
            due_date DATE NOT NULL,
            paid_date DATE,
            status VARCHAR(20) DEFAULT 'due',
            payment_mode VARCHAR(50),
            receipt_number VARCHAR(100),
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        );
    `,
    users: `
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            email VARCHAR(255) UNIQUE NOT NULL,
            phone VARCHAR(20) UNIQUE NOT NULL,
            role VARCHAR(20) DEFAULT 'agent',
            status VARCHAR(20) DEFAULT 'active',
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        );
    `
}
