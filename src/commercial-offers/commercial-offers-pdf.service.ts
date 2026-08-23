import { Injectable, Logger } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit');

export interface CommercialOfferPdfData {
  offer_number: string;
  client_name: string;
  client_company: string;
  origin: string;
  destination: string;
  cargo_description?: string;
  cargo_weight?: number;
  cargo_volume?: number;
  price_usd: number;
  price_local: number;
  inclusions?: string[];
  exclusions?: string[];
  terms?: string;
  status: string;
  created_at: string | Date;
}

@Injectable()
export class CommercialOffersPdfService {
  private readonly logger = new Logger(CommercialOffersPdfService.name);

  // Brand colors
  private readonly PRIMARY_COLOR = '#1A237E'; // Deep indigo
  private readonly ACCENT_COLOR = '#0D47A1'; // Blue accent
  private readonly SUCCESS_COLOR = '#2E7D32'; // Green
  private readonly DANGER_COLOR = '#C62828'; // Red
  private readonly TEXT_COLOR = '#212121'; // Near-black
  private readonly LIGHT_TEXT = '#616161'; // Gray text
  private readonly TABLE_HEADER_BG = '#1A237E';
  private readonly TABLE_STRIPE_BG = '#F5F5F5';
  private readonly BORDER_COLOR = '#E0E0E0';

  /**
   * Generate a professional commercial offer PDF as a Buffer.
   */
  async generatePdf(data: CommercialOfferPdfData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margins: { top: 50, bottom: 50, left: 50, right: 50 },
          info: {
            Title: `Commercial Offer ${data.offer_number}`,
            Author: 'Yaqeen Logistics',
            Subject: `Commercial Offer for ${data.client_company}`,
            Creator: 'Yaqeen Backend System',
          },
        });

        const buffers: Buffer[] = [];
        doc.on('data', (chunk: Buffer) => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', (err: Error) => reject(err));

        const pageWidth =
          doc.page.width - doc.page.margins.left - doc.page.margins.right;

        // === HEADER SECTION ===
        this.drawHeader(doc, data, pageWidth);

        // === CLIENT INFORMATION ===
        this.drawClientSection(doc, data, pageWidth);

        // === ROUTE INFORMATION ===
        this.drawRouteSection(doc, data, pageWidth);

        // === CARGO DETAILS ===
        if (data.cargo_description || data.cargo_weight || data.cargo_volume) {
          this.drawCargoSection(doc, data, pageWidth);
        }

        // === PRICING TABLE ===
        this.drawPricingSection(doc, data, pageWidth);

        // === INCLUSIONS & EXCLUSIONS ===
        if (
          (data.inclusions && data.inclusions.length > 0) ||
          (data.exclusions && data.exclusions.length > 0)
        ) {
          this.drawInclusionsExclusions(doc, data, pageWidth);
        }

        // === TERMS & CONDITIONS ===
        if (data.terms) {
          this.drawTermsSection(doc, data, pageWidth);
        }

        // === FOOTER / SIGNATURE ===
        this.drawFooter(doc, data, pageWidth);

        doc.end();
      } catch (error) {
        this.logger.error('Failed to generate PDF', error);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  /**
   * Draw the company header with branding.
   */
  private drawHeader(
    doc: PDFKit.PDFDocument,
    data: CommercialOfferPdfData,
    pageWidth: number,
  ) {
    const startY = doc.y;

    // Company name as main brand element
    doc
      .fontSize(28)
      .font('Helvetica-Bold')
      .fillColor(this.PRIMARY_COLOR)
      .text('YAQEEN', doc.page.margins.left, startY, { continued: true })
      .fontSize(28)
      .fillColor(this.ACCENT_COLOR)
      .text(' LOGISTICS');

    doc
      .fontSize(9)
      .font('Helvetica')
      .fillColor(this.LIGHT_TEXT)
      .text(
        'International Freight & Cargo Solutions',
        doc.page.margins.left,
        startY + 32,
      );

    // Offer number and date — right-aligned
    const offerDate = data.created_at
      ? new Date(data.created_at).toLocaleDateString('en-GB', {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
        })
      : new Date().toLocaleDateString('en-GB', {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
        });

    doc
      .fontSize(10)
      .font('Helvetica-Bold')
      .fillColor(this.TEXT_COLOR)
      .text(data.offer_number, doc.page.margins.left, startY, {
        align: 'right',
      });

    doc
      .fontSize(9)
      .font('Helvetica')
      .fillColor(this.LIGHT_TEXT)
      .text(offerDate, doc.page.margins.left, startY + 14, {
        align: 'right',
      });

    // Status badge
    const statusColors: Record<string, string> = {
      draft: '#757575',
      sent: '#F57F17',
      accepted: this.SUCCESS_COLOR,
      rejected: this.DANGER_COLOR,
    };
    const badgeColor = statusColors[data.status] || '#757575';

    doc
      .fontSize(8)
      .font('Helvetica-Bold')
      .fillColor(badgeColor)
      .text(data.status.toUpperCase(), doc.page.margins.left, startY + 28, {
        align: 'right',
      });

    // Divider line
    doc.moveDown(1.5);
    const dividerY = doc.y;
    doc
      .moveTo(doc.page.margins.left, dividerY)
      .lineTo(doc.page.margins.left + pageWidth, dividerY)
      .strokeColor(this.PRIMARY_COLOR)
      .lineWidth(2)
      .stroke();

    doc.moveDown(0.8);

    // Title
    doc
      .fontSize(18)
      .font('Helvetica-Bold')
      .fillColor(this.PRIMARY_COLOR)
      .text('COMMERCIAL OFFER', { align: 'center' });

    doc.moveDown(1);
  }

  /**
   * Draw the client information section.
   */
  private drawClientSection(
    doc: PDFKit.PDFDocument,
    data: CommercialOfferPdfData,
    pageWidth: number,
  ) {
    this.drawSectionTitle(doc, 'CLIENT INFORMATION');

    const startY = doc.y;
    const colWidth = pageWidth / 2;

    // Left column: Labels, Right column: Values
    const fields = [
      { label: 'Client Name:', value: data.client_name },
      { label: 'Company:', value: data.client_company },
    ];

    fields.forEach((field, idx) => {
      const y = startY + idx * 20;
      doc
        .fontSize(10)
        .font('Helvetica-Bold')
        .fillColor(this.LIGHT_TEXT)
        .text(field.label, doc.page.margins.left, y, { width: colWidth });

      doc
        .fontSize(10)
        .font('Helvetica')
        .fillColor(this.TEXT_COLOR)
        .text(field.value, doc.page.margins.left + 120, y, {
          width: colWidth - 20,
        });
    });

    doc.y = startY + fields.length * 20 + 10;
    doc.moveDown(0.5);
  }

  /**
   * Draw the route information section with origin → destination.
   */
  private drawRouteSection(
    doc: PDFKit.PDFDocument,
    data: CommercialOfferPdfData,
    pageWidth: number,
  ) {
    this.drawSectionTitle(doc, 'ROUTE DETAILS');

    const startY = doc.y;
    const boxHeight = 60;
    const arrowWidth = 50;
    const boxWidth = (pageWidth - arrowWidth) / 2;

    // Origin box
    doc
      .roundedRect(doc.page.margins.left, startY, boxWidth, boxHeight, 4)
      .strokeColor(this.BORDER_COLOR)
      .lineWidth(1)
      .stroke();

    doc
      .fontSize(8)
      .font('Helvetica')
      .fillColor(this.LIGHT_TEXT)
      .text('ORIGIN', doc.page.margins.left + 10, startY + 8, {
        width: boxWidth - 20,
      });

    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .fillColor(this.TEXT_COLOR)
      .text(data.origin, doc.page.margins.left + 10, startY + 24, {
        width: boxWidth - 20,
      });

    // Arrow
    const arrowY = startY + boxHeight / 2;
    const arrowStartX = doc.page.margins.left + boxWidth + 8;
    const arrowEndX = arrowStartX + arrowWidth - 16;

    doc
      .moveTo(arrowStartX, arrowY)
      .lineTo(arrowEndX, arrowY)
      .strokeColor(this.ACCENT_COLOR)
      .lineWidth(2)
      .stroke();

    // Arrowhead
    doc
      .moveTo(arrowEndX - 6, arrowY - 4)
      .lineTo(arrowEndX, arrowY)
      .lineTo(arrowEndX - 6, arrowY + 4)
      .strokeColor(this.ACCENT_COLOR)
      .lineWidth(2)
      .stroke();

    // Destination box
    const destX = doc.page.margins.left + boxWidth + arrowWidth;
    doc
      .roundedRect(destX, startY, boxWidth, boxHeight, 4)
      .strokeColor(this.BORDER_COLOR)
      .lineWidth(1)
      .stroke();

    doc
      .fontSize(8)
      .font('Helvetica')
      .fillColor(this.LIGHT_TEXT)
      .text('DESTINATION', destX + 10, startY + 8, { width: boxWidth - 20 });

    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .fillColor(this.TEXT_COLOR)
      .text(data.destination, destX + 10, startY + 24, {
        width: boxWidth - 20,
      });

    doc.y = startY + boxHeight + 15;
    doc.moveDown(0.5);
  }

  /**
   * Draw cargo details section.
   */
  private drawCargoSection(
    doc: PDFKit.PDFDocument,
    data: CommercialOfferPdfData,
    pageWidth: number,
  ) {
    this.drawSectionTitle(doc, 'CARGO DETAILS');

    const tableTop = doc.y;
    const colWidths = [pageWidth * 0.5, pageWidth * 0.25, pageWidth * 0.25];
    const rowHeight = 25;

    // Table header
    this.drawTableRow(
      doc,
      tableTop,
      colWidths,
      rowHeight,
      ['Description', 'Weight (kg)', 'Volume (m³)'],
      true,
    );

    // Data row
    this.drawTableRow(
      doc,
      tableTop + rowHeight,
      colWidths,
      rowHeight,
      [
        data.cargo_description || '—',
        data.cargo_weight?.toFixed(2) || '—',
        data.cargo_volume?.toFixed(2) || '—',
      ],
      false,
    );

    doc.y = tableTop + rowHeight * 2 + 15;
    doc.moveDown(0.5);
  }

  /**
   * Draw pricing section with USD and local prices.
   */
  private drawPricingSection(
    doc: PDFKit.PDFDocument,
    data: CommercialOfferPdfData,
    pageWidth: number,
  ) {
    this.drawSectionTitle(doc, 'PRICING');

    const tableTop = doc.y;
    const colWidths = [pageWidth * 0.5, pageWidth * 0.25, pageWidth * 0.25];
    const rowHeight = 28;

    // Table header
    this.drawTableRow(
      doc,
      tableTop,
      colWidths,
      rowHeight,
      ['Item', 'USD', 'Local Currency'],
      true,
    );

    // Pricing row
    this.drawTableRow(
      doc,
      tableTop + rowHeight,
      colWidths,
      rowHeight,
      [
        `${data.origin} → ${data.destination}`,
        `$${data.price_usd.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
        data.price_local.toLocaleString('en-US', {
          minimumFractionDigits: 2,
        }),
      ],
      false,
    );

    // Total row (highlighted)
    const totalY = tableTop + rowHeight * 2;
    doc
      .rect(
        doc.page.margins.left,
        totalY,
        colWidths[0] + colWidths[1] + colWidths[2],
        rowHeight,
      )
      .fillColor('#E3F2FD')
      .fill();

    doc
      .fontSize(11)
      .font('Helvetica-Bold')
      .fillColor(this.PRIMARY_COLOR)
      .text('TOTAL', doc.page.margins.left + 10, totalY + 8, {
        width: colWidths[0] - 10,
      });

    doc
      .fontSize(11)
      .font('Helvetica-Bold')
      .fillColor(this.PRIMARY_COLOR)
      .text(
        `$${data.price_usd.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
        doc.page.margins.left + colWidths[0] + 10,
        totalY + 8,
        { width: colWidths[1] - 10 },
      );

    doc
      .fontSize(11)
      .font('Helvetica-Bold')
      .fillColor(this.PRIMARY_COLOR)
      .text(
        data.price_local.toLocaleString('en-US', {
          minimumFractionDigits: 2,
        }),
        doc.page.margins.left + colWidths[0] + colWidths[1] + 10,
        totalY + 8,
        { width: colWidths[2] - 10 },
      );

    doc.y = totalY + rowHeight + 15;
    doc.moveDown(0.5);
  }

  /**
   * Draw inclusions and exclusions side by side.
   */
  private drawInclusionsExclusions(
    doc: PDFKit.PDFDocument,
    data: CommercialOfferPdfData,
    pageWidth: number,
  ) {
    this.drawSectionTitle(doc, "WHAT'S INCLUDED & EXCLUDED");

    const startY = doc.y;
    const halfWidth = pageWidth / 2 - 10;

    // Inclusions column
    if (data.inclusions && data.inclusions.length > 0) {
      doc
        .fontSize(10)
        .font('Helvetica-Bold')
        .fillColor(this.SUCCESS_COLOR)
        .text('✓  INCLUDED', doc.page.margins.left, startY);

      data.inclusions.forEach((item, idx) => {
        doc
          .fontSize(9)
          .font('Helvetica')
          .fillColor(this.TEXT_COLOR)
          .text(`  •  ${item}`, doc.page.margins.left, startY + 18 + idx * 16, {
            width: halfWidth,
          });
      });
    }

    // Exclusions column
    if (data.exclusions && data.exclusions.length > 0) {
      const exclX = doc.page.margins.left + halfWidth + 20;
      doc
        .fontSize(10)
        .font('Helvetica-Bold')
        .fillColor(this.DANGER_COLOR)
        .text('✗  EXCLUDED', exclX, startY, { width: halfWidth });

      data.exclusions.forEach((item, idx) => {
        doc
          .fontSize(9)
          .font('Helvetica')
          .fillColor(this.TEXT_COLOR)
          .text(`  •  ${item}`, exclX, startY + 18 + idx * 16, {
            width: halfWidth,
          });
      });
    }

    const maxItems = Math.max(
      data.inclusions?.length || 0,
      data.exclusions?.length || 0,
    );
    doc.y = startY + 18 + maxItems * 16 + 15;
    doc.moveDown(0.5);
  }

  /**
   * Draw terms and conditions section.
   */
  private drawTermsSection(
    doc: PDFKit.PDFDocument,
    data: CommercialOfferPdfData,
    pageWidth: number,
  ) {
    // Check if there's enough space, otherwise add new page
    if (doc.y > doc.page.height - 200) {
      doc.addPage();
    }

    this.drawSectionTitle(doc, 'TERMS & CONDITIONS');

    doc
      .fontSize(9)
      .font('Helvetica')
      .fillColor(this.TEXT_COLOR)
      .text(data.terms!, {
        width: pageWidth,
        lineGap: 3,
      });

    doc.moveDown(1);
  }

  /**
   * Draw the footer with signature lines and company stamp area.
   */
  private drawFooter(
    doc: PDFKit.PDFDocument,
    _data: CommercialOfferPdfData,
    pageWidth: number,
  ) {
    // Ensure footer is at the bottom area
    const minFooterY = doc.page.height - doc.page.margins.bottom - 140;
    if (doc.y < minFooterY) {
      doc.y = minFooterY;
    } else if (doc.y > doc.page.height - 180) {
      doc.addPage();
      doc.y = doc.page.height - doc.page.margins.bottom - 140;
    }

    // Divider
    doc
      .moveTo(doc.page.margins.left, doc.y)
      .lineTo(doc.page.margins.left + pageWidth, doc.y)
      .strokeColor(this.BORDER_COLOR)
      .lineWidth(1)
      .stroke();

    doc.moveDown(1);

    const sigY = doc.y;
    const halfWidth = pageWidth / 2 - 20;

    // Provider signature
    doc
      .fontSize(9)
      .font('Helvetica-Bold')
      .fillColor(this.TEXT_COLOR)
      .text('For Yaqeen Logistics:', doc.page.margins.left, sigY, {
        width: halfWidth,
      });

    doc
      .moveTo(doc.page.margins.left, sigY + 50)
      .lineTo(doc.page.margins.left + halfWidth, sigY + 50)
      .strokeColor(this.BORDER_COLOR)
      .lineWidth(0.5)
      .stroke();

    doc
      .fontSize(8)
      .font('Helvetica')
      .fillColor(this.LIGHT_TEXT)
      .text('Signature / Stamp', doc.page.margins.left, sigY + 55, {
        width: halfWidth,
        align: 'center',
      });

    // Client signature
    const clientSigX = doc.page.margins.left + halfWidth + 40;
    doc
      .fontSize(9)
      .font('Helvetica-Bold')
      .fillColor(this.TEXT_COLOR)
      .text('For Client:', clientSigX, sigY, { width: halfWidth });

    doc
      .moveTo(clientSigX, sigY + 50)
      .lineTo(clientSigX + halfWidth, sigY + 50)
      .strokeColor(this.BORDER_COLOR)
      .lineWidth(0.5)
      .stroke();

    doc
      .fontSize(8)
      .font('Helvetica')
      .fillColor(this.LIGHT_TEXT)
      .text('Signature / Stamp', clientSigX, sigY + 55, {
        width: halfWidth,
        align: 'center',
      });

    // Bottom disclaimer
    doc.moveDown(4);
    doc
      .fontSize(7)
      .font('Helvetica')
      .fillColor(this.LIGHT_TEXT)
      .text(
        'This commercial offer is valid for 30 days from the date of issue. Prices are subject to change based on market conditions.',
        doc.page.margins.left,
        doc.y,
        { width: pageWidth, align: 'center' },
      );

    doc
      .fontSize(7)
      .font('Helvetica')
      .fillColor(this.LIGHT_TEXT)
      .text(
        '© Yaqeen Logistics — All Rights Reserved',
        doc.page.margins.left,
        doc.y + 3,
        { width: pageWidth, align: 'center' },
      );
  }

  // ==========================================
  // HELPER METHODS
  // ==========================================

  /**
   * Draw a section title with accent underline.
   */
  private drawSectionTitle(doc: PDFKit.PDFDocument, title: string) {
    doc
      .fontSize(11)
      .font('Helvetica-Bold')
      .fillColor(this.PRIMARY_COLOR)
      .text(title);

    const underlineY = doc.y + 2;
    doc
      .moveTo(doc.page.margins.left, underlineY)
      .lineTo(doc.page.margins.left + 80, underlineY)
      .strokeColor(this.ACCENT_COLOR)
      .lineWidth(1.5)
      .stroke();

    doc.moveDown(0.6);
  }

  /**
   * Draw a table row (header or data) with columns.
   */
  private drawTableRow(
    doc: PDFKit.PDFDocument,
    y: number,
    colWidths: number[],
    rowHeight: number,
    values: string[],
    isHeader: boolean,
  ) {
    let x = doc.page.margins.left;
    const totalWidth = colWidths.reduce((a, b) => a + b, 0);

    // Background
    if (isHeader) {
      doc
        .rect(doc.page.margins.left, y, totalWidth, rowHeight)
        .fillColor(this.TABLE_HEADER_BG)
        .fill();
    } else {
      doc
        .rect(doc.page.margins.left, y, totalWidth, rowHeight)
        .fillColor(this.TABLE_STRIPE_BG)
        .fill();
    }

    // Border
    doc
      .rect(doc.page.margins.left, y, totalWidth, rowHeight)
      .strokeColor(this.BORDER_COLOR)
      .lineWidth(0.5)
      .stroke();

    // Text values
    values.forEach((val, idx) => {
      doc
        .fontSize(isHeader ? 9 : 10)
        .font(isHeader ? 'Helvetica-Bold' : 'Helvetica')
        .fillColor(isHeader ? '#FFFFFF' : this.TEXT_COLOR)
        .text(val, x + 10, y + (rowHeight - (isHeader ? 9 : 10)) / 2, {
          width: colWidths[idx] - 20,
          lineBreak: false,
        });
      x += colWidths[idx];
    });
  }
}
