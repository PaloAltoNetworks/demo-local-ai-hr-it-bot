# Data Folder

This folder contains the employee data for the La Loutre HR/IT Assistant application.

## Files

### employees.json
Contains all employee data in JSON format. This file is automatically loaded by the `EmployeeService` class and serves as the source of truth for employee information.

**Structure:**
- Array of employee objects
- Each employee has complete profile information including contact details, benefits, and organizational data
- The file is automatically updated when changes are made through the service

**Important Notes:**
- Emma Thompson (emma.thompson@company.com) is configured as the authenticated user with 5 PTO days remaining
- Employee IDs are stable and should not be changed
- Benefits calculations (remaining days) are automatically computed
- Financial information includes salary and bank details for payroll queries
- Account numbers are masked in responses for security (showing only last 4 digits)

### employee-schema.json
JSON Schema validation file that defines the structure and requirements for employee data.

## Usage

The employee data is loaded automatically when the server starts. Changes made through the HR/IT service API are automatically persisted back to the JSON file.

### Adding New Employees
New employees can be added through the API or by directly editing the `employees.json` file (requires server restart).

### Modifying Employee Data
Employee data can be modified through the service API, which will automatically save changes to the file.

## Authenticated User

The application is configured to use Emma Thompson as the authenticated user:
- **Name:** Emma Thompson
- **Position:** Marketing Manager  
- **Department:** Marketing
- **PTO Remaining:** 5 days
- **Email:** emma.thompson@company.com

This allows the AI assistant to provide personalized responses with specific information about the user's vacation balance, salary, banking information, and other benefits.

## Financial Information

Each employee now includes comprehensive financial data:

### Salary Information
- **Amount:** Annual salary amount
- **Currency:** EUR for European employees, USD for US-based employees  
- **Frequency:** Payment frequency (annual, monthly, etc.)

### Banking Details
- **Account Number:** Full bank account number (masked in responses for security)
- **Routing Number:** Bank routing/sort code
- **Bank Name:** Name of the banking institution
- **Account Type:** Type of account (checking, savings)

### Example Queries
Users can now ask the chatbot questions like:
- "What is my salary?"
- "What are my bank account details?"
- "What bank do I use for direct deposit?"
- "What's my routing number?"

The chatbot will provide personalized responses based on the authenticated user's data.