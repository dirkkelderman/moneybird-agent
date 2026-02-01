/**
 * Production-friendly Telegram test (runs with Node.js, no tsx needed)
 */

import { sendTelegram, sendErrorAlertTelegram, initializeTelegram } from "../notifications/telegram.js";

async function testTelegramNotifications() {
  console.log("🧪 Testing Telegram Notifications\n");

  // Test 1: Initialize Telegram Configuration
  console.log("Test 1: Initialize Telegram Configuration");
  const telegramConfig = initializeTelegram();
  if (telegramConfig && telegramConfig.enabled) {
    console.log("✅ Telegram configured");
    console.log(`   Bot Token: ${telegramConfig.botToken.substring(0, 10)}...`);
    console.log(`   Chat IDs: ${telegramConfig.chatIds.join(", ")}\n`);
  } else {
    console.log("❌ Telegram not configured. Check your .env file for TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_IDS.\n");
    console.log("To set up Telegram:");
    console.log("1. Create a bot by messaging @BotFather on Telegram");
    console.log("2. Get your bot token");
    console.log("3. Get your chat ID (message @userinfobot or add bot to group and check updates)");
    console.log("4. Add to .env:");
    console.log("   TELEGRAM_BOT_TOKEN=your_bot_token");
    console.log("   TELEGRAM_CHAT_IDS=your_chat_id,another_chat_id");
    console.log("");
    return;
  }

  // Test 2: Send Simple Test Message
  console.log("Test 2: Send Simple Test Message");
  try {
    await sendTelegram(
      "🧪 <b>Test Message</b>\n\nThis is a test message from the Moneybird Agent.\n\nIf you received this, Telegram notifications are working!"
    );
    console.log("✅ Test message sent successfully\n");
  } catch (error) {
    console.error("❌ Failed to send test message:", error);
    return;
  }

  // Test 3: Send Error Alert
  console.log("Test 3: Send Error Alert");
  try {
    await sendErrorAlertTelegram(
      {
        invoiceId: "test-invoice-123",
        status: "error",
        action: "alert_user",
        confidence: 50,
        errors: ["Failed to extract data", "Contact not found"],
        requiresHumanIntervention: true,
      },
      "Detailed error message: The Vision API failed to extract key information from the PDF, and no matching contact was found in Moneybird."
    );
    console.log("✅ Error alert sent successfully\n");
  } catch (error) {
    console.error("❌ Failed to send error alert:", error);
    return;
  }

  console.log("✅ All Telegram tests completed!\n");
  console.log("📱 Check your Telegram for the test messages.");
}

testTelegramNotifications().catch((error) => {
  console.error("Fatal error during Telegram tests:", error);
  process.exit(1);
});
