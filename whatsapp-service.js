// WhatsApp Service with 360Dialog/Twilio Integration and Automation
import { dataService } from './data-service.js'
import { db } from './indexeddb-config.js'

export class WhatsAppService {
    constructor() {
        this.provider = 'demo' // 'demo', '360dialog', 'twilio'
        this.config = {
            '360dialog': {
                apiUrl: 'https://waba.360dialog.io/v1/messages',
                apiKey: '',
                webhookUrl: ''
            },
            'twilio': {
                accountSid: '',
                authToken: '',
                fromNumber: '',
                apiUrl: 'https://api.twilio.com/2010-04-01/Accounts'
            }
        }
        this.messageQueue = []
        this.scheduledMessages = []
        this.init()
    }

    async init() {
        // Load configuration from settings
        await this.loadConfiguration()
        
        // Start message queue processor
        this.startMessageProcessor()
        
        // Setup daily EMI reminder scheduler
        this.setupEMIReminderScheduler()
        
        // Listen for service worker messages
        this.setupServiceWorkerListener()
    }

    async loadConfiguration() {
        try {
            const settings = await db.app_settings.toArray()
            settings.forEach(setting => {
                if (setting.key.startsWith('whatsapp_')) {
                    const provider = setting.key.split('_')[1]
                    const configKey = setting.key.split('_')[2]
                    
                    if (this.config[provider]) {
                        this.config[provider][configKey] = setting.value
                    }
                }
            })
        } catch (error) {
            console.error('Error loading WhatsApp configuration:', error)
        }
    }

    async saveConfiguration(provider, config) {
        try {
            for (const [key, value] of Object.entries(config)) {
                await db.app_settings.put({
                    key: `whatsapp_${provider}_${key}`,
                    value: value
                })
            }
            
            this.config[provider] = { ...this.config[provider], ...config }
            this.provider = provider
            
            return { success: true }
        } catch (error) {
            console.error('Error saving WhatsApp configuration:', error)
            return { success: false, error: error.message }
        }
    }

    // Message Templates
    getMessageTemplate(type, data) {
        const templates = {
            welcome: `🎉 *स्वागत है JLS FINANCE LTD में!*

प्रिय ${data.customerName},

आपका पंजीकरण सफल हो गया है।

📋 *विवरण:*
• ग्राहक ID: ${data.customerId}
• फोन: ${data.phone}
• पंजीकरण तिथि: ${data.registrationDate}

हमारी सेवाओं के लिए धन्यवाद!

*JLS FINANCE LTD*
📞 सहायता: +91-XXXXXXXXXX`,

            loan_approved: `🎉 *लोन अप्रूवल सूचना*

प्रिय ${data.customerName},

बधाई हो! आपका लोन आवेदन अप्रूव हो गया है।

📋 *लोन विवरण:*
• लोन ID: ${data.loanId}
• राशि: ₹${data.amount.toLocaleString()}
• अवधि: ${data.tenure} महीने
• ब्याज दर: ${data.interestRate}%
• EMI राशि: ₹${data.emiAmount.toLocaleString()}
• पहली EMI: ${data.firstEMIDate}

जल्द ही हमारे प्रतिनिधि आपसे संपर्क करेंगे।

*JLS FINANCE LTD*`,

            emi_reminder: `⏰ *EMI रिमाइंडर*

प्रिय ${data.customerName},

आपकी EMI का भुगतान देय है:

📋 *EMI विवरण:*
• लोन ID: ${data.loanId}
• EMI संख्या: ${data.emiNumber}
• राशि: ₹${data.amount.toLocaleString()}
• देय तिथि: ${data.dueDate}
• दिन बचे: ${data.daysRemaining}

कृपया समय पर भुगतान करें।

💳 *भुगतान विकल्प:*
• नकद भुगतान
• ऑनलाइन ट्रांसफर
• चेक/DD

*JLS FINANCE LTD*
📞 संपर्क: +91-XXXXXXXXXX`,

            emi_overdue: `🚨 *EMI अतिदेय सूचना*

प्रिय ${data.customerName},

आपकी EMI का भुगतान अतिदेय है:

📋 *विवरण:*
• लोन ID: ${data.loanId}
• EMI संख्या: ${data.emiNumber}
• राशि: ₹${data.amount.toLocaleString()}
• देय तिथि: ${data.dueDate}
• अतिदेय दिन: ${data.overdueDays}
• विलंब शुल्क: ₹${data.lateFee || 0}

कृपया तुरंत भुगतान करें।

*JLS FINANCE LTD*
📞 तत्काल संपर्क: +91-XXXXXXXXXX`,

            emi_paid: `✅ *EMI भुगतान पुष्टि*

प्रिय ${data.customerName},

आपका EMI भुगतान सफलतापूर्वक प्राप्त हुआ!

📋 *भुगतान विवरण:*
• रसीद संख्या: ${data.receiptNumber}
• राशि: ₹${data.amount.toLocaleString()}
• भुगतान तिथि: ${data.paidDate}
• भुगतान माध्यम: ${data.paymentMode}

🗓️ *अगली EMI:*
• तिथि: ${data.nextEMIDate || 'पूर्ण'}
• राशि: ₹${data.nextEMIAmount?.toLocaleString() || '0'}

धन्यवाद!
*JLS FINANCE LTD*`,

            loan_closure: `🎊 *लोन समापन सूचना*

प्रिय ${data.customerName},

बधाई हो! आपका लोन सफलतापूर्वक बंद हो गया है।

📋 *समापन विवरण:*
• लोन ID: ${data.loanId}
• कुल राशि: ₹${data.totalAmount.toLocaleString()}
• भुगतान की गई राशि: ₹${data.paidAmount.toLocaleString()}
• समापन तिथि: ${data.closureDate}

आपके साथ व्यापार करके खुशी हुई।

*JLS FINANCE LTD*
📞 भविष्य की सेवाओं के लिए: +91-XXXXXXXXXX`,

            birthday_wish: `🎂 *जन्मदिन की शुभकामनाएं!*

प्रिय ${data.customerName},

आपको जन्मदिन की हार्दिक शुभकामनाएं!

🎉 इस खुशी के मौके पर JLS FINANCE LTD परिवार की ओर से ढेर सारी शुभकामनाएं।

आपका आने वाला साल खुशियों से भरा हो!

*JLS FINANCE LTD*`,

            festival_greetings: `🪔 *त्योहार की शुभकामनाएं!*

प्रिय ${data.customerName},

${data.festival} की हार्दिक शुभकामनाएं!

🎊 JLS FINANCE LTD परिवार की ओर से आपको और आपके परिवार को त्योहार की ढेर सारी शुभकामनाएं।

खुशियों से भरा हो आपका जीवन!

*JLS FINANCE LTD*`
        }

        return templates[type] || ''
    }

    // Send message via 360Dialog
    async send360DialogMessage(phone, message) {
        try {
            const response = await fetch(this.config['360dialog'].apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'D360-API-KEY': this.config['360dialog'].apiKey
                },
                body: JSON.stringify({
                    to: phone.replace(/[^0-9]/g, ''),
                    type: 'text',
                    text: {
                        body: message
                    }
                })
            })

            const result = await response.json()
            
            if (response.ok) {
                return { success: true, messageId: result.messages[0].id }
            } else {
                throw new Error(result.error?.message || 'Failed to send message')
            }
        } catch (error) {
            console.error('360Dialog send error:', error)
            return { success: false, error: error.message }
        }
    }

    // Send message via Twilio
    async sendTwilioMessage(phone, message) {
        try {
            const accountSid = this.config.twilio.accountSid
            const authToken = this.config.twilio.authToken
            const fromNumber = this.config.twilio.fromNumber

            const response = await fetch(
                `${this.config.twilio.apiUrl}/${accountSid}/Messages.json`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`)
                    },
                    body: new URLSearchParams({
                        From: `whatsapp:${fromNumber}`,
                        To: `whatsapp:${phone}`,
                        Body: message
                    })
                }
            )

            const result = await response.json()
            
            if (response.ok) {
                return { success: true, messageId: result.sid }
            } else {
                throw new Error(result.message || 'Failed to send message')
            }
        } catch (error) {
            console.error('Twilio send error:', error)
            return { success: false, error: error.message }
        }
    }

    // Demo message sending (for testing)
    async sendDemoMessage(phone, message) {
        return new Promise((resolve) => {
            setTimeout(() => {
                const success = Math.random() > 0.1 // 90% success rate
                if (success) {
                    resolve({ success: true, messageId: 'demo_' + Date.now() })
                } else {
                    resolve({ success: false, error: 'Demo failure' })
                }
            }, 1000)
        })
    }

    // Main send message function
    async sendMessage(phone, message, type = 'manual', priority = 'normal') {
        try {
            // Clean phone number
            const cleanPhone = phone.replace(/[^0-9]/g, '')
            if (cleanPhone.length < 10) {
                throw new Error('Invalid phone number')
            }

            // Add to message queue
            const messageData = {
                id: Date.now() + Math.random(),
                phone: cleanPhone,
                message,
                type,
                priority,
                timestamp: new Date().toISOString(),
                attempts: 0,
                status: 'pending'
            }

            this.messageQueue.push(messageData)
            
            // Save to IndexedDB for persistence
            await db.sync_queue.add({
                table_name: 'whatsapp_messages',
                operation: 'send',
                data: messageData,
                timestamp: new Date(),
                synced: false
            })

            return { success: true, messageId: messageData.id }
        } catch (error) {
            console.error('Error queuing message:', error)
            return { success: false, error: error.message }
        }
    }

    // Process message queue
    async processMessageQueue() {
        if (this.messageQueue.length === 0) return

        // Sort by priority and timestamp
        this.messageQueue.sort((a, b) => {
            const priorityOrder = { high: 3, normal: 2, low: 1 }
            const aPriority = priorityOrder[a.priority] || 2
            const bPriority = priorityOrder[b.priority] || 2
            
            if (aPriority !== bPriority) {
                return bPriority - aPriority
            }
            
            return new Date(a.timestamp) - new Date(b.timestamp)
        })

        const message = this.messageQueue.shift()
        
        try {
            let result
            
            switch (this.provider) {
                case '360dialog':
                    result = await this.send360DialogMessage(message.phone, message.message)
                    break
                case 'twilio':
                    result = await this.sendTwilioMessage(message.phone, message.message)
                    break
                default:
                    result = await this.sendDemoMessage(message.phone, message.message)
            }

            if (result.success) {
                message.status = 'sent'
                message.messageId = result.messageId
                console.log('Message sent successfully:', message.id)
            } else {
                message.attempts++
                message.status = 'failed'
                message.error = result.error

                // Retry logic
                if (message.attempts < 3) {
                    message.status = 'pending'
                    this.messageQueue.push(message) // Re-queue for retry
                }
            }

            // Update in IndexedDB
            await this.updateMessageStatus(message)

        } catch (error) {
            console.error('Error processing message:', error)
            message.attempts++
            message.status = 'failed'
            message.error = error.message

            if (message.attempts < 3) {
                message.status = 'pending'
                this.messageQueue.push(message)
            }
        }
    }

    // Start message processor
    startMessageProcessor() {
        setInterval(() => {
            this.processMessageQueue()
        }, 5000) // Process every 5 seconds
    }

    // Update message status in IndexedDB
    async updateMessageStatus(message) {
        try {
            const syncItems = await db.sync_queue
                .where('data.id')
                .equals(message.id)
                .toArray()

            if (syncItems.length > 0) {
                await db.sync_queue.update(syncItems[0].id, {
                    data: message,
                    synced: message.status === 'sent'
                })
            }
        } catch (error) {
            console.error('Error updating message status:', error)
        }
    }

    // Send welcome message to new customer
    async sendWelcomeMessage(customer) {
        const message = this.getMessageTemplate('welcome', {
            customerName: customer.name,
            customerId: customer.id,
            phone: customer.phone,
            registrationDate: new Date().toLocaleDateString('hi-IN')
        })

        return await this.sendMessage(customer.phone, message, 'welcome', 'high')
    }

    // Send loan approval message
    async sendLoanApprovalMessage(loan, customer) {
        const message = this.getMessageTemplate('loan_approved', {
            customerName: customer.name,
            loanId: loan.id,
            amount: loan.principal,
            tenure: loan.tenure,
            interestRate: loan.interest_rate,
            emiAmount: loan.emi_amount,
            firstEMIDate: loan.first_emi_date || 'जल्द ही सूचित किया जाएगा'
        })

        return await this.sendMessage(customer.phone, message, 'loan_approval', 'high')
    }

    // Send EMI reminder
    async sendEMIReminder(emi, loan, customer) {
        const dueDate = new Date(emi.due_date)
        const today = new Date()
        const daysRemaining = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24))

        const message = this.getMessageTemplate('emi_reminder', {
            customerName: customer.name,
            loanId: loan.id,
            emiNumber: emi.emi_number,
            amount: emi.amount,
            dueDate: dueDate.toLocaleDateString('hi-IN'),
            daysRemaining: Math.max(0, daysRemaining)
        })

        const priority = daysRemaining <= 1 ? 'high' : 'normal'
        return await this.sendMessage(customer.phone, message, 'emi_reminder', priority)
    }

    // Send overdue EMI notice
    async sendOverdueEMINotice(emi, loan, customer) {
        const dueDate = new Date(emi.due_date)
        const today = new Date()
        const overdueDays = Math.ceil((today - dueDate) / (1000 * 60 * 60 * 24))

        const message = this.getMessageTemplate('emi_overdue', {
            customerName: customer.name,
            loanId: loan.id,
            emiNumber: emi.emi_number,
            amount: emi.amount,
            dueDate: dueDate.toLocaleDateString('hi-IN'),
            overdueDays,
            lateFee: overdueDays * 50 // ₹50 per day late fee
        })

        return await this.sendMessage(customer.phone, message, 'emi_overdue', 'high')
    }

    // Send EMI payment confirmation
    async sendEMIPaymentConfirmation(emi, loan, customer, nextEMI = null) {
        const message = this.getMessageTemplate('emi_paid', {
            customerName: customer.name,
            receiptNumber: emi.receipt_number,
            amount: emi.amount,
            paidDate: new Date(emi.paid_date).toLocaleDateString('hi-IN'),
            paymentMode: emi.payment_mode || 'नकद',
            nextEMIDate: nextEMI ? new Date(nextEMI.due_date).toLocaleDateString('hi-IN') : null,
            nextEMIAmount: nextEMI?.amount
        })

        return await this.sendMessage(customer.phone, message, 'emi_confirmation', 'normal')
    }

    // Setup EMI reminder scheduler
    setupEMIReminderScheduler() {
        // Run daily at 9 AM
        const scheduleDaily = () => {
            const now = new Date()
            const scheduledTime = new Date()
            scheduledTime.setHours(9, 0, 0, 0)

            if (scheduledTime <= now) {
                scheduledTime.setDate(scheduledTime.getDate() + 1)
            }

            const timeUntilScheduled = scheduledTime - now
            
            setTimeout(() => {
                this.sendDailyEMIReminders()
                setInterval(() => {
                    this.sendDailyEMIReminders()
                }, 24 * 60 * 60 * 1000) // Every 24 hours
            }, timeUntilScheduled)
        }

        scheduleDaily()
    }

    // Send daily EMI reminders
    async sendDailyEMIReminders() {
        try {
            console.log('Sending daily EMI reminders...')
            
            const today = new Date()
            const tomorrow = new Date(today)
            tomorrow.setDate(tomorrow.getDate() + 1)
            const dayAfterTomorrow = new Date(today)
            dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2)

            // Get EMIs due today, tomorrow, and day after tomorrow
            const emisResult = await dataService.getEMIs()
            if (!emisResult.success) return

            const emis = emisResult.data.filter(emi => {
                const dueDate = new Date(emi.due_date)
                return emi.status !== 'paid' && (
                    dueDate.toDateString() === today.toDateString() ||
                    dueDate.toDateString() === tomorrow.toDateString() ||
                    dueDate.toDateString() === dayAfterTomorrow.toDateString()
                )
            })

            // Send reminders
            for (const emi of emis) {
                const loan = emi.loans
                const customer = loan?.customers

                if (customer && customer.phone) {
                    const dueDate = new Date(emi.due_date)
                    
                    if (dueDate < today) {
                        // Overdue
                        await this.sendOverdueEMINotice(emi, loan, customer)
                    } else {
                        // Upcoming
                        await this.sendEMIReminder(emi, loan, customer)
                    }
                }
            }

            console.log(`Sent reminders for ${emis.length} EMIs`)
        } catch (error) {
            console.error('Error sending daily EMI reminders:', error)
        }
    }

    // Setup service worker listener
    setupServiceWorkerListener() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.addEventListener('message', (event) => {
                if (event.data.type === 'SEND_DAILY_EMI_REMINDERS') {
                    this.sendDailyEMIReminders()
                }
                
                if (event.data.type === 'SEND_PENDING_WHATSAPP') {
                    this.processPendingMessages()
                }
            })
        }
    }

    // Process pending messages from IndexedDB
    async processPendingMessages() {
        try {
            const pendingMessages = await db.sync_queue
                .where('table_name')
                .equals('whatsapp_messages')
                .and(item => !item.synced)
                .toArray()

            for (const item of pendingMessages) {
                this.messageQueue.push(item.data)
            }

            console.log(`Loaded ${pendingMessages.length} pending messages`)
        } catch (error) {
            console.error('Error processing pending messages:', error)
        }
    }

    // Get message statistics
    async getMessageStats() {
        try {
            const messages = await db.sync_queue
                .where('table_name')
                .equals('whatsapp_messages')
                .toArray()

            const stats = {
                total: messages.length,
                sent: messages.filter(m => m.data.status === 'sent').length,
                pending: messages.filter(m => m.data.status === 'pending').length,
                failed: messages.filter(m => m.data.status === 'failed').length
            }

            return { success: true, data: stats }
        } catch (error) {
            console.error('Error getting message stats:', error)
            return { success: false, error: error.message }
        }
    }

    // Test API connection
    async testConnection() {
        try {
            const testMessage = 'Test message from JLS Finance'
            const testPhone = '+919999999999' // Test number
            
            let result
            switch (this.provider) {
                case '360dialog':
                    result = await this.send360DialogMessage(testPhone, testMessage)
                    break
                case 'twilio':
                    result = await this.sendTwilioMessage(testPhone, testMessage)
                    break
                default:
                    result = await this.sendDemoMessage(testPhone, testMessage)
            }

            return result
        } catch (error) {
            console.error('Error testing connection:', error)
            return { success: false, error: error.message }
        }
    }
}

// Create singleton instance
export const whatsappService = new WhatsAppService()

