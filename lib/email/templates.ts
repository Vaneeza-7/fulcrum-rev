export function dailyDigestHtml(params: {
  companyName: string
  date: string
  leadCount: number
  topLeads: Array<{
    fullName: string
    title: string | null
    company: string | null
    fulcrumScore: number
    fulcrumGrade: string | null
  }>
}): string {
  const { companyName, date, leadCount, topLeads } = params

  const leadRows = topLeads
    .slice(0, 5)
    .map(
      (lead) => `
      <tr>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; font-size: 14px; color: #1f2937;">
          ${escapeHtml(lead.fullName)}
        </td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; font-size: 14px; color: #4b5563;">
          ${escapeHtml(lead.title ?? '--')}
        </td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; font-size: 14px; color: #4b5563;">
          ${escapeHtml(lead.company ?? '--')}
        </td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; font-size: 14px; color: #1f2937; text-align: center; font-weight: 600;">
          ${lead.fulcrumScore}
        </td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; font-size: 14px; text-align: center;">
          <span style="display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; ${gradeStyle(lead.fulcrumGrade)}">
            ${escapeHtml(lead.fulcrumGrade ?? '--')}
          </span>
        </td>
      </tr>`
    )
    .join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Fulcrum Daily Lead Digest</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6;">
    <tr>
      <td align="center" style="padding: 32px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">

          <!-- Header -->
          <tr>
            <td style="background-color: #0e1525; padding: 24px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <span style="font-size: 22px; font-weight: 700; color: #22d3ee; letter-spacing: -0.5px;">Fulcrum</span>
                  </td>
                  <td align="right">
                    <span style="font-size: 13px; color: #9ca3af;">${escapeHtml(date)}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Title -->
          <tr>
            <td style="padding: 32px 32px 8px 32px;">
              <h1 style="margin: 0; font-size: 20px; font-weight: 700; color: #111827;">
                Daily Lead Report for ${escapeHtml(companyName)}
              </h1>
            </td>
          </tr>

          <!-- Summary -->
          <tr>
            <td style="padding: 8px 32px 24px 32px;">
              <p style="margin: 0; font-size: 15px; color: #6b7280; line-height: 1.5;">
                <strong style="color: #111827; font-size: 28px;">${leadCount}</strong>
                <span style="margin-left: 6px;">qualified lead${leadCount === 1 ? '' : 's'} discovered today</span>
              </p>
            </td>
          </tr>

          <!-- Lead Table -->
          ${topLeads.length > 0 ? `
          <tr>
            <td style="padding: 0 32px 16px 32px;">
              <h2 style="margin: 0 0 12px 0; font-size: 14px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">
                Top Leads
              </h2>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e5e7eb; border-radius: 6px; border-collapse: collapse;">
                <thead>
                  <tr style="background-color: #f9fafb;">
                    <th style="padding: 10px 12px; text-align: left; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e5e7eb;">Name</th>
                    <th style="padding: 10px 12px; text-align: left; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e5e7eb;">Title</th>
                    <th style="padding: 10px 12px; text-align: left; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e5e7eb;">Company</th>
                    <th style="padding: 10px 12px; text-align: center; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e5e7eb;">Score</th>
                    <th style="padding: 10px 12px; text-align: center; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e5e7eb;">Grade</th>
                  </tr>
                </thead>
                <tbody>
                  ${leadRows}
                </tbody>
              </table>
            </td>
          </tr>
          ` : ''}

          <!-- Attachment note -->
          <tr>
            <td style="padding: 8px 32px 32px 32px;">
              <p style="margin: 0; font-size: 14px; color: #6b7280; line-height: 1.5;">
                Full details in the attached spreadsheet.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 20px 32px; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; font-size: 12px; color: #9ca3af; text-align: center;">
                Powered by <strong style="color: #6b7280;">Fulcrum</strong> &mdash; fulcrumcollective.io
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function gradeStyle(grade: string | null): string {
  switch (grade?.toUpperCase()) {
    case 'A+':
    case 'A':
      return 'background-color: #d1fae5; color: #065f46;'
    case 'A-':
    case 'B+':
      return 'background-color: #dbeafe; color: #1e40af;'
    case 'B':
    case 'B-':
      return 'background-color: #e0e7ff; color: #3730a3;'
    case 'C+':
    case 'C':
      return 'background-color: #fef3c7; color: #92400e;'
    default:
      return 'background-color: #f3f4f6; color: #6b7280;'
  }
}
