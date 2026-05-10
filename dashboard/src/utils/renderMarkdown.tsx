import type { ReactNode } from 'react'

/**
 * Lightweight markdown-to-JSX renderer for chat messages.
 *
 * Handles the subset of markdown the AI assistant produces:
 * - ### headings
 * - **bold** text
 * - - bullet lists
 * - 1. numbered lists
 * - Paragraph breaks (double newlines)
 */

/** Parse inline **bold** markers into JSX. */
function parseInline(text: string, key: string): ReactNode {
  const parts: ReactNode[] = []
  const regex = /\*\*(.+?)\*\*/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    parts.push(
      <strong key={`${key}-b-${match.index}`}>{match[1]}</strong>,
    )
    lastIndex = regex.lastIndex
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>
}

/** Render a markdown string to React elements. */
export function renderMarkdown(content: string): ReactNode {
  const lines = content.split('\n')
  const elements: ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Skip empty lines
    if (line.trim() === '') {
      i++
      continue
    }

    // ### Heading
    const headingMatch = line.match(/^#{1,4}\s+(.+)/)
    if (headingMatch) {
      elements.push(
        <h4 key={`h-${i}`} className="chat-md-heading">
          {parseInline(headingMatch[1], `h-${i}`)}
        </h4>,
      )
      i++
      continue
    }

    // Bullet list (- item)
    if (line.match(/^\s*-\s+/)) {
      const items: ReactNode[] = []
      while (i < lines.length && lines[i].match(/^\s*-\s+/)) {
        const itemText = lines[i].replace(/^\s*-\s+/, '')
        items.push(
          <li key={`li-${i}`}>{parseInline(itemText, `li-${i}`)}</li>,
        )
        i++
      }
      elements.push(
        <ul key={`ul-${i}`} className="chat-md-list">
          {items}
        </ul>,
      )
      continue
    }

    // Numbered list (1. item)
    if (line.match(/^\s*\d+\.\s+/)) {
      const items: ReactNode[] = []
      while (i < lines.length && lines[i].match(/^\s*\d+\.\s+/)) {
        const itemText = lines[i].replace(/^\s*\d+\.\s+/, '')
        items.push(
          <li key={`oli-${i}`}>{parseInline(itemText, `oli-${i}`)}</li>,
        )
        i++
      }
      elements.push(
        <ol key={`ol-${i}`} className="chat-md-list">
          {items}
        </ol>,
      )
      continue
    }

    // Regular paragraph — collect consecutive non-special lines
    const paraLines: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].match(/^#{1,4}\s+/) &&
      !lines[i].match(/^\s*-\s+/) &&
      !lines[i].match(/^\s*\d+\.\s+/)
    ) {
      paraLines.push(lines[i])
      i++
    }

    if (paraLines.length > 0) {
      elements.push(
        <p key={`p-${i}`} className="chat-md-p">
          {parseInline(paraLines.join(' '), `p-${i}`)}
        </p>,
      )
    }
  }

  return <>{elements}</>
}
