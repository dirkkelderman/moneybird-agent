/**
 * Email Notification Test
 * 
 * Tests email notification functionality with Gmail SMTP
 * Usage: npm run test:email
 */

import { sendEmail, initializeEmail } from "../notifications/email.js";
import { sendErrorAlert } from "../notifications/index.js";
import type { WorkflowSummary } from "../notifications/types.js";

async function testEmailNotifications() {
  console.log("🧪 Testing Email Notifications\n");

  // Test 1: Initialize email configuration
  console.log("Test 1: Initialize Email Configuration");
  const emailConfig = initializeEmail();
  
  if (!emailConfig) {
    console.log("❌ Email not configured");
    console.log("   Required environment variables:");
    console.log("   - EMAIL_SMTP_HOST");
    console.log("   - EMAIL_SMTP_USER");
    console.log("   - EMAIL_SMTP_PASS");
    console.log("   - EMAIL_TO");
    return;
  }
  
  console.log("✅ Email configured");
  console.log(`   SMTP Host: ${emailConfig.smtp.host}`);
  console.log(`   SMTP Port: ${emailConfig.smtp.port}`);
  console.log(`   From: ${emailConfig.from}`);
  console.log(`   To: ${emailConfig.to.join(", ")}`);
  console.log("");

  // Test 2: Send simple test email
  console.log("Test 2: Send Simple Test Email");
  try {
    await sendEmail(
      "Moneybird Agent - Test Email",
      "<h1>Test Email</h1><p>This is a test email from the Moneybird Agent.</p><p>If you receive this, email notifications are working correctly!</p>",
      "Test Email\n\nThis is a test email from the Moneybird Agent.\n\nIf you receive this, email notifications are working correctly!"
    );
    console.log("✅ Test email sent successfully");
  } catch (error) {
    console.log("❌ Failed to send test email:", error instanceof Error ? error.message : String(error));
    return;
  }
  console.log("");

  // Test 3: Send error alert
  console.log("Test 3: Send Error Alert");
  try {
    const workflowSummary: WorkflowSummary = {
      invoiceId: "test-invoice-123",
      status: "error",
      action: "alert_user",
      confidence: 75,
      errors: ["Test error: Email notification test"],
      requiresHumanIntervention: true,
    };

    const errorDetails = "This is a test error alert.\n\nIt simulates an invoice processing error that requires human intervention.";

    await sendErrorAlert(workflowSummary, errorDetails);
    console.log("✅ Error alert sent successfully");
  } catch (error) {
    console.log("❌ Failed to send error alert:", error instanceof Error ? error.message : String(error));
    return;
  }
  console.log("");

  console.log("✅ All email tests completed!");
  console.log("\n📧 Check your inbox for the test emails.");
}

// Run the test
testEmailNotifications().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
