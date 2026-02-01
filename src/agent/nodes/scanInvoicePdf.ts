/**
 * ScanInvoicePdf Node
 *
 * Scans invoice PDF using OCR/vision to extract:
 * - Supplier name, IBAN, VAT number
 * - Amounts (excl/incl tax, BTW)
 * - Invoice date and number
 * - Description
 */

import type { AgentState, InvoiceExtraction } from "../state.js";
import { ChatOpenAI } from "@langchain/openai";
import { getEnv } from "../../config/env.js";
import { MoneybirdMCPClient } from "../../moneybird/mcpClient.js";
import pdfParse from "pdf-parse";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { execFile } from "child_process";
import { promisify } from "util";

const exec = promisify(execFile);

/**
 * Convert PDF first page to PNG using pdftoppm (Poppler)
 * Returns PNG buffer
 */
async function pdfToPng(pdfBuffer: Buffer): Promise<Buffer> {
  // Write PDF to temporary file
  const pdfPath = join(tmpdir(), `invoice_${Date.now()}.pdf`);
  await writeFile(pdfPath, pdfBuffer);

  try {
    const outputPath = pdfPath.replace(/\.pdf$/, "");

    // Use pdftoppm to convert first page to PNG
    await exec("pdftoppm", [
      "-png",
      "-singlefile",
      "-f",
      "1", // First page
      "-l",
      "1", // Last page (same as first, so only one page)
      pdfPath,
      outputPath,
    ]);

    // Read the generated PNG file
    const pngPath = `${outputPath}.png`;
    const imageBuffer = await readFile(pngPath);

    // Clean up temporary files
    try {
      await import("fs/promises").then((fs) => fs.unlink(pdfPath));
      await import("fs/promises").then((fs) => fs.unlink(pngPath));
    } catch {
      // Ignore cleanup errors
    }

    return imageBuffer;
  } catch (error) {
    // Clean up PDF file on error
    try {
      await import("fs/promises").then((fs) => fs.unlink(pdfPath));
    } catch {
      // Ignore cleanup errors
    }
    throw new Error(
      `Failed to convert PDF to PNG: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Extract invoice data from PDF using OpenAI Chat Completions API with vision
 * Uses two-step approach:
 * 1. Convert PDF to PNG using pdftoppm (Poppler)
 * 2. Use base64-encoded image_url in Chat Completions API (vision-capable model)
 */
async function extractWithVisionFromPdf(
  pdfBuffer: Buffer,
  env: ReturnType<typeof getEnv>
): Promise<InvoiceExtraction> {
  const prompt = `
Analyze this invoice PDF and extract all relevant data.
Return ONLY valid JSON matching this schema:

{
  "supplier_name": string | null,
  "supplier_iban": string | null,
  "supplier_vat": string | null,
  "amount_excl_tax": number | null,
  "amount_incl_tax": number | null,
  "tax_amount": number | null,
  "tax_rate": number | null,
  "invoice_date": string (YYYY-MM-DD) | null,
  "invoice_number": string | null,
  "description": string | null,
  "currency": string | null,
  "confidence": number (0-100)
}

Rules:
- Extract the real supplier/company name shown on the invoice
- Look for IBAN, VAT, totals, tax, invoice date & number
- Extract currency code (e.g., "USD", "EUR", "GBP") - look for currency symbols or codes on the invoice
- IMPORTANT: If amount is negative (credit note), extract it as positive (e.g., if invoice shows -7.26, extract 7.26)
- Use null if unknown
- Confidence reflects overall certainty
- Output JSON only, no markdown, no explanations
`;

  try {
    console.log(
      JSON.stringify({
        level: "info",
        event: "converting_pdf_to_png",
        pdf_size: pdfBuffer.length,
        timestamp: new Date().toISOString(),
      })
    );

    // Step 1: Convert PDF first page to PNG
    const imageBuffer = await pdfToPng(pdfBuffer);

    console.log(
      JSON.stringify({
        level: "info",
        event: "pdf_converted_to_png",
        image_size: imageBuffer.length,
        timestamp: new Date().toISOString(),
      })
    );

    // Step 2: Use image_url with base64 in Chat Completions API (vision-capable)
    // For vision, we use base64-encoded image_url, not file_id
    console.log(
      JSON.stringify({
        level: "info",
        event: "calling_openai_chat_completions_vision",
        image_size: imageBuffer.length,
        timestamp: new Date().toISOString(),
      })
    );

    // Use Chat Completions API with vision (gpt-4o or gpt-4-turbo support vision)
    const visionModel = env.OPENAI_MODEL.includes("gpt-4")
      ? env.OPENAI_MODEL
      : "gpt-4o";

    // Convert PNG buffer to base64
    const imageBase64 = imageBuffer.toString("base64");

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: visionModel,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/png;base64,${imageBase64}`,
                  detail: "high", // High detail for accurate text extraction from invoices
                },
              },
            ],
          },
        ],
        temperature: 0,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log(
        JSON.stringify({
          level: "error",
          event: "openai_chat_completions_vision_error",
          status: response.status,
          status_text: response.statusText,
          error_body: errorText.substring(0, 500),
          timestamp: new Date().toISOString(),
        })
      );
      throw new Error(
        `OpenAI PDF vision failed: ${response.status} ${
          response.statusText
        } - ${errorText.substring(0, 200)}`
      );
    }

    const data = (await response.json()) as any;

    // Chat Completions API response format
    const text = data.choices?.[0]?.message?.content || "";

    if (!text) {
      throw new Error("No content in OpenAI Chat Completions response");
    }

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in OpenAI response");
    }

    const extraction = JSON.parse(jsonMatch[0]) as InvoiceExtraction;

    console.log(
      JSON.stringify({
        level: "info",
        event: "vision_extraction_success",
        supplier_name: extraction.supplier_name,
        confidence: extraction.confidence,
        timestamp: new Date().toISOString(),
      })
    );

    return extraction;
  } catch (error) {
    console.log(
      JSON.stringify({
        level: "error",
        event: "vision_extraction_failed",
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
      })
    );

    // Fallback to basic extraction
    return {
      supplier_name: undefined,
      supplier_iban: undefined,
      supplier_vat: undefined,
      amount_excl_tax: undefined,
      amount_incl_tax: undefined,
      tax_amount: undefined,
      tax_rate: undefined,
      invoice_date: undefined,
      invoice_number: undefined,
      description: undefined,
      confidence: 0,
    };
  }
}

export async function scanInvoicePdf(
  state: AgentState
): Promise<Partial<AgentState>> {
  console.log(
    JSON.stringify({
      level: "debug",
      event: "scan_invoice_pdf_start",
      has_invoice: !!state.invoice,
      has_pdf_path: !!state.invoicePdfPath,
      has_attachments: !!(
        state.invoice?.attachments && state.invoice.attachments.length > 0
      ),
      attachment_count: state.invoice?.attachments?.length || 0,
      timestamp: new Date().toISOString(),
    })
  );

  if (!state.invoicePdfPath && !state.invoice?.attachments?.[0]) {
    console.log(
      JSON.stringify({
        level: "warn",
        event: "scan_invoice_pdf_no_source",
        message: "No PDF path or attachment available",
        timestamp: new Date().toISOString(),
      })
    );
    return {
      error: "No PDF path or attachment available",
      currentNode: "scanInvoicePdf",
    };
  }

  const env = getEnv();
  const llm = new ChatOpenAI({
    modelName: env.OPENAI_MODEL,
    temperature: 0,
  });

  try {
    // Step 1: Extract text from PDF or download PDF
    let pdfText = "";
    let pdfBuffer: Buffer | undefined = undefined;

    if (state.invoicePdfPath) {
      pdfBuffer = await readFile(state.invoicePdfPath);
      try {
        const pdfData = await pdfParse(pdfBuffer);
        pdfText = pdfData.text;
      } catch (parseError) {
        // PDF might be scanned/image-based, will use vision API
        console.log(
          JSON.stringify({
            level: "debug",
            event: "pdf_text_extraction_failed_from_path",
            will_use_vision: true,
            timestamp: new Date().toISOString(),
          })
        );
      }
    } else if (state.invoice?.attachments?.[0]) {
      // Try to get PDF via receipt or attachment URL
      const attachment = state.invoice.attachments[0];
      const client = new MoneybirdMCPClient();

      console.log(
        JSON.stringify({
          level: "debug",
          event: "pdf_attachment_found",
          attachment_filename: attachment.filename,
          attachment_id: attachment.id,
          has_url: !!attachment.url,
          url: attachment.url || "N/A",
          timestamp: new Date().toISOString(),
        })
      );

      let pdfUrl: string | undefined = attachment.url;

      // If no URL in attachment, try to get receipt
      if (!pdfUrl && attachment.id) {
        try {
          console.log(
            JSON.stringify({
              level: "debug",
              event: "trying_receipt_download",
              attachment_id: attachment.id,
              timestamp: new Date().toISOString(),
            })
          );

          const receipt = await client.getReceipt(attachment.id);
          if (receipt.url) {
            pdfUrl = receipt.url;
            console.log(
              JSON.stringify({
                level: "info",
                event: "receipt_url_found",
                url: receipt.url,
                timestamp: new Date().toISOString(),
              })
            );
          }
        } catch (receiptError) {
          console.log(
            JSON.stringify({
              level: "debug",
              event: "receipt_download_failed",
              error:
                receiptError instanceof Error
                  ? receiptError.message
                  : String(receiptError),
              timestamp: new Date().toISOString(),
            })
          );
        }
      }

      // Try to list receipts for this purchase invoice (this is the correct way)
      if (!pdfBuffer && !pdfUrl && state.invoice.id) {
        try {
          console.log(
            JSON.stringify({
              level: "info",
              event: "listing_receipts_for_invoice",
              purchase_invoice_id: state.invoice.id,
              timestamp: new Date().toISOString(),
            })
          );

          const receipts = await client.listReceipts({
            purchase_invoice_id: state.invoice.id,
          });

          console.log(
            JSON.stringify({
              level: "info",
              event: "receipts_listed",
              count: receipts.length,
              receipt_ids: receipts.map((r) => r.id),
              has_urls: receipts.map((r) => !!r.url),
              timestamp: new Date().toISOString(),
            })
          );

          if (receipts.length > 0) {
            // Try each receipt until we get a PDF
            for (const receipt of receipts) {
              // First try URL if available
              if (receipt.url) {
                pdfUrl = receipt.url;
                console.log(
                  JSON.stringify({
                    level: "info",
                    event: "receipt_url_found",
                    receipt_id: receipt.id,
                    url: pdfUrl,
                    timestamp: new Date().toISOString(),
                  })
                );
                break;
              }

              // Try direct PDF download via MCP
              if (receipt.id) {
                try {
                  console.log(
                    JSON.stringify({
                      level: "info",
                      event: "downloading_receipt_pdf_via_mcp",
                      receipt_id: receipt.id,
                      timestamp: new Date().toISOString(),
                    })
                  );

                  pdfBuffer = await client.downloadReceiptPdf(receipt.id);

                  // Verify it's a valid PDF
                  if (
                    pdfBuffer.length > 100 &&
                    pdfBuffer.toString("ascii", 0, 4) === "%PDF"
                  ) {
                    console.log(
                      JSON.stringify({
                        level: "info",
                        event: "receipt_pdf_downloaded_via_mcp",
                        receipt_id: receipt.id,
                        pdf_size: pdfBuffer.length,
                        timestamp: new Date().toISOString(),
                      })
                    );
                    break; // Success, stop trying
                  } else {
                    console.log(
                      JSON.stringify({
                        level: "warn",
                        event: "invalid_pdf_received",
                        receipt_id: receipt.id,
                        pdf_size: pdfBuffer.length,
                        pdf_header: pdfBuffer.toString(
                          "ascii",
                          0,
                          Math.min(10, pdfBuffer.length)
                        ),
                        timestamp: new Date().toISOString(),
                      })
                    );
                    pdfBuffer = undefined; // Reset, try next receipt
                  }
                } catch (downloadError) {
                  console.log(
                    JSON.stringify({
                      level: "debug",
                      event: "mcp_direct_download_failed",
                      receipt_id: receipt.id,
                      error:
                        downloadError instanceof Error
                          ? downloadError.message
                          : String(downloadError),
                      timestamp: new Date().toISOString(),
                    })
                  );
                }
              }
            }
          }
        } catch (listError) {
          console.log(
            JSON.stringify({
              level: "debug",
              event: "list_receipts_failed",
              error:
                listError instanceof Error
                  ? listError.message
                  : String(listError),
              timestamp: new Date().toISOString(),
            })
          );
        }
      }

      // Try downloading attachment directly via Moneybird API URL
      // Moneybird API pattern: /{administration_id}/documents/purchase_invoices/{invoice_id}/attachments/{attachment_id}/download
      if (!pdfBuffer && !pdfUrl && attachment.id && state.invoice.id) {
        try {
          const administrationId = client.getAdministrationId();
          if (administrationId) {
            const attachmentUrl = `https://moneybird.com/api/v2/${administrationId}/documents/purchase_invoices/${state.invoice.id}/attachments/${attachment.id}/download`;

            console.log(
              JSON.stringify({
                level: "info",
                event: "trying_attachment_download_via_api",
                attachment_id: attachment.id,
                invoice_id: state.invoice.id,
                constructed_url: attachmentUrl,
                timestamp: new Date().toISOString(),
              })
            );

            const env = getEnv();
            const response = await fetch(attachmentUrl, {
              headers: {
                Authorization: `Bearer ${
                  env.MCP_SERVER_AUTH_TOKEN ||
                  process.env.MCP_SERVER_AUTH_TOKEN ||
                  ""
                }`,
              },
            });

            if (response.ok) {
              pdfBuffer = Buffer.from(await response.arrayBuffer());

              // Verify it's a PDF
              if (
                pdfBuffer.length > 100 &&
                pdfBuffer.toString("ascii", 0, 4) === "%PDF"
              ) {
                console.log(
                  JSON.stringify({
                    level: "info",
                    event: "attachment_pdf_downloaded_via_api",
                    pdf_size: pdfBuffer.length,
                    timestamp: new Date().toISOString(),
                  })
                );

                // Store PDF for vision API (keep buffer in memory too)
                const pdfPath = join(
                  tmpdir(),
                  `invoice_${state.invoice.id}.pdf`
                );
                await writeFile(pdfPath, pdfBuffer);

                // Keep pdfBuffer in memory for vision extraction (don't lose it!)
                // pdfBuffer is already set, so we're good

                // Try text extraction
                try {
                  const pdfData = await pdfParse(pdfBuffer);
                  pdfText = pdfData.text;
                  console.log(
                    JSON.stringify({
                      level: "info",
                      event: "pdf_text_extracted_from_download",
                      text_length: pdfText.length,
                      timestamp: new Date().toISOString(),
                    })
                  );
                } catch (parseError) {
                  console.log(
                    JSON.stringify({
                      level: "debug",
                      event: "pdf_text_extraction_failed_after_download",
                      will_use_vision: true,
                      timestamp: new Date().toISOString(),
                    })
                  );
                }
              } else {
                console.log(
                  JSON.stringify({
                    level: "warn",
                    event: "invalid_pdf_from_attachment_api",
                    pdf_size: pdfBuffer.length,
                    pdf_header: pdfBuffer.toString(
                      "ascii",
                      0,
                      Math.min(20, pdfBuffer.length)
                    ),
                    timestamp: new Date().toISOString(),
                  })
                );
                pdfBuffer = undefined;
              }
            } else {
              console.log(
                JSON.stringify({
                  level: "debug",
                  event: "attachment_api_download_failed",
                  status: response.status,
                  status_text: response.statusText,
                  timestamp: new Date().toISOString(),
                })
              );
            }
          }
        } catch (apiError) {
          console.log(
            JSON.stringify({
              level: "debug",
              event: "attachment_api_download_error",
              error:
                apiError instanceof Error ? apiError.message : String(apiError),
              timestamp: new Date().toISOString(),
            })
          );
        }
      }

      // Only show warning if we truly don't have a PDF
      if (!pdfBuffer && !pdfUrl) {
        console.log(
          JSON.stringify({
            level: "warn",
            event: "pdf_attachment_no_url",
            message: "Attachment has no URL and all download methods failed",
            timestamp: new Date().toISOString(),
          })
        );
      } else if (pdfBuffer) {
        // PDF was successfully downloaded
        console.log(
          JSON.stringify({
            level: "info",
            event: "pdf_buffer_available_after_download",
            pdf_size: pdfBuffer.length,
            timestamp: new Date().toISOString(),
          })
        );
      }

      // Download PDF if we have a URL but not a buffer yet
      if (pdfUrl && !pdfBuffer) {
        try {
          // Download PDF from Moneybird using MCP token
          const env = getEnv();
          const response = await fetch(pdfUrl, {
            headers: {
              Authorization: `Bearer ${
                env.MCP_SERVER_AUTH_TOKEN ||
                process.env.MCP_SERVER_AUTH_TOKEN ||
                ""
              }`,
            },
          });

          if (!response.ok) {
            throw new Error(
              `Failed to download PDF: ${response.status} ${response.statusText}`
            );
          }

          pdfBuffer = Buffer.from(await response.arrayBuffer());

          // Try text extraction first (fast)
          try {
            const pdfData = await pdfParse(pdfBuffer);
            pdfText = pdfData.text;
            console.log(
              JSON.stringify({
                level: "info",
                event: "pdf_text_extracted",
                text_length: pdfText.length,
                timestamp: new Date().toISOString(),
              })
            );
          } catch (parseError) {
            console.log(
              JSON.stringify({
                level: "debug",
                event: "pdf_text_extraction_failed",
                error:
                  parseError instanceof Error
                    ? parseError.message
                    : String(parseError),
                will_use_vision: true,
                timestamp: new Date().toISOString(),
              })
            );
          }

          // Store PDF buffer for vision API
          const pdfPath = join(tmpdir(), `invoice_${state.invoice.id}.pdf`);
          await writeFile(pdfPath, pdfBuffer);

          console.log(
            JSON.stringify({
              level: "info",
              event: "pdf_downloaded_successfully",
              pdf_size: pdfBuffer.length,
              text_length: pdfText.length,
              timestamp: new Date().toISOString(),
            })
          );
        } catch (downloadError) {
          console.log(
            JSON.stringify({
              level: "error",
              event: "pdf_download_failed",
              error:
                downloadError instanceof Error
                  ? downloadError.message
                  : String(downloadError),
              timestamp: new Date().toISOString(),
            })
          );
          pdfText = state.invoicePdfText || "";
        }
      } else if (!pdfBuffer) {
        // Only show warning if we truly don't have a PDF buffer
        console.log(
          JSON.stringify({
            level: "warn",
            event: "pdf_attachment_no_url",
            message: "Attachment has no URL and receipt download failed",
            timestamp: new Date().toISOString(),
          })
        );
        pdfText = state.invoicePdfText || "";
      }
      // If pdfBuffer is set, we're good - continue to vision extraction
    }

    // If PDF download failed, try to extract from invoice metadata
    if (!pdfText || pdfText.length < 10) {
      console.log(
        JSON.stringify({
          level: "info",
          event: "pdf_unavailable_using_metadata",
          message: "PDF not available, extracting from invoice metadata",
          invoice_reference: state.invoice?.reference,
          invoice_notes: state.invoice?.notes?.substring(0, 100),
          timestamp: new Date().toISOString(),
        })
      );

      // Use invoice reference and notes as fallback
      pdfText = [state.invoice?.reference || "", state.invoice?.notes || ""]
        .filter(Boolean)
        .join("\n");

      // Even with minimal text, try LLM extraction - it might find patterns
      if (pdfText.length > 0) {
        console.log(
          JSON.stringify({
            level: "info",
            event: "using_metadata_for_extraction",
            text_length: pdfText.length,
            timestamp: new Date().toISOString(),
          })
        );
      }
    }

    // Step 2: Get PDF buffer for vision API (if available)
    // Always prefer vision API when PDF is available for better extraction
    if (!pdfBuffer && state.invoice?.id) {
      // Try to get PDF buffer from stored path
      const storedPath = join(tmpdir(), `invoice_${state.invoice.id}.pdf`);
      try {
        pdfBuffer = await readFile(storedPath);
        console.log(
          JSON.stringify({
            level: "info",
            event: "pdf_buffer_loaded_from_storage",
            pdf_size: pdfBuffer.length,
            timestamp: new Date().toISOString(),
          })
        );
      } catch (storageError) {
        // PDF not stored yet
        console.log(
          JSON.stringify({
            level: "debug",
            event: "pdf_not_found_in_storage",
            path: storedPath,
            error:
              storageError instanceof Error
                ? storageError.message
                : String(storageError),
            timestamp: new Date().toISOString(),
          })
        );
      }
    }

    // Log PDF buffer status before vision extraction
    console.log(
      JSON.stringify({
        level: "debug",
        event: "pdf_buffer_status_before_vision",
        has_pdf_buffer: !!pdfBuffer,
        pdf_buffer_size: pdfBuffer?.length || 0,
        pdf_text_length: pdfText.length,
        timestamp: new Date().toISOString(),
      })
    );

    // Always use vision API if we have a PDF buffer (better accuracy)
    const shouldUseVision = !!pdfBuffer;

    if (shouldUseVision && pdfBuffer) {
      console.log(
        JSON.stringify({
          level: "info",
          event: "using_vision_api",
          reason: "pdf_available_for_vision_extraction",
          pdf_size: pdfBuffer.length,
          text_extraction_length: pdfText.length,
          timestamp: new Date().toISOString(),
        })
      );
    } else {
      console.log(
        JSON.stringify({
          level: "warn",
          event: "vision_api_not_used",
          reason: "no_pdf_buffer_available",
          pdf_text_length: pdfText.length,
          timestamp: new Date().toISOString(),
        })
      );
    }

    // Step 3: Extract data using text or vision
    let extraction: InvoiceExtraction;

    if (shouldUseVision && pdfBuffer) {
      // Use vision API to extract from PDF images
      console.log(
        JSON.stringify({
          level: "info",
          event: "extracting_with_vision",
          timestamp: new Date().toISOString(),
        })
      );

      extraction = await extractWithVisionFromPdf(pdfBuffer, env);
    } else {
      // Use text-based extraction
      const extractionPrompt = `
Extract invoice data from the following text (which may be from a PDF or invoice metadata). Return ONLY valid JSON matching this schema:
{
  "supplier_name": string | null,
  "supplier_iban": string | null,
  "supplier_vat": string | null,
  "amount_excl_tax": number | null,
  "amount_incl_tax": number | null,
  "tax_amount": number | null,
  "tax_rate": number | null,
  "invoice_date": string (YYYY-MM-DD) | null,
  "invoice_number": string | null,
  "description": string | null,
  "confidence": number (0-100)
}

Text to analyze:
${pdfText}

Important:
- Extract supplier name from filename, reference, or text
- Look for amounts, dates, VAT numbers, IBANs
- If text is minimal, extract what you can and set confidence accordingly
- Return null for fields you cannot determine

Return only the JSON object, no other text.
`;

      const response = await llm.invoke(extractionPrompt);
      const responseText = response.content as string;

      // Parse JSON from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in LLM response");
      }

      extraction = JSON.parse(jsonMatch[0]) as InvoiceExtraction;
    }

    // Normalize amounts: make negative amounts positive (credit notes should be stored as positive)
    const normalizeAmount = (
      amount: number | null | undefined
    ): number | undefined => {
      if (amount === null || amount === undefined) return undefined;
      // If negative, make it positive (credit note)
      return Math.abs(amount);
    };

    // Update invoice with extracted data if available
    const invoiceUpdates: Partial<typeof state.invoice> = {};

    const amountExclTax = normalizeAmount(extraction.amount_excl_tax);
    if (amountExclTax !== undefined) {
      invoiceUpdates.total_price_excl_tax = Math.round(amountExclTax * 100); // Convert to cents
    }

    const amountInclTax = normalizeAmount(extraction.amount_incl_tax);
    if (amountInclTax !== undefined) {
      invoiceUpdates.total_price_incl_tax = Math.round(amountInclTax * 100); // Convert to cents
    }

    const taxAmount = normalizeAmount(extraction.tax_amount);
    if (taxAmount !== undefined) {
      invoiceUpdates.tax = Math.round(taxAmount * 100); // Convert to cents
    }

    if (extraction.invoice_date) {
      invoiceUpdates.invoice_date = extraction.invoice_date;
    }
    if (extraction.invoice_number) {
      invoiceUpdates.reference = extraction.invoice_number;
    }
    if (extraction.description) {
      invoiceUpdates.notes = extraction.description;
    }

    // Store currency in extraction (will be used in autoBook)
    // Note: Moneybird invoice currency is set when invoice is created, we log it for reference
    if (extraction.currency) {
      console.log(
        JSON.stringify({
          level: "info",
          event: "currency_detected",
          currency: extraction.currency,
          invoice_currency: state.invoice?.currency || "EUR",
          note:
            extraction.currency !== (state.invoice?.currency || "EUR")
              ? "Currency mismatch - invoice is in different currency than Moneybird default"
              : "Currency matches",
          timestamp: new Date().toISOString(),
        })
      );
    }

    return {
      currentNode: "scanInvoicePdf",
      invoicePdfText: pdfText,
      invoicePdfPath: state.invoicePdfPath,
      extraction,
      invoice: state.invoice
        ? { ...state.invoice, ...invoiceUpdates }
        : undefined,
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unknown error in scanInvoicePdf",
      currentNode: "scanInvoicePdf",
    };
  }
}
