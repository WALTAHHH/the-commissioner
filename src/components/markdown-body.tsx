import Markdown, { type Components } from 'react-markdown'

/**
 * Rule body markdown, styled with design-system tokens.
 *
 * react-markdown renders CommonMark to React elements and does NOT emit raw
 * HTML by default (no rehype-raw), so untrusted rule bodies cannot inject
 * script — sanitisation is structural, not regex-based.
 *
 * Element classes lean on the token utilities (text-foreground,
 * text-muted-foreground, bg-muted) rather than the typography plugin, which
 * is not installed. Sizes sit one step below page headings so rule bodies
 * read as content inside cards.
 */
const CLASSES = {
  h1: 'mt-5 mb-2 text-xl font-semibold text-foreground first:mt-0',
  h2: 'mt-5 mb-2 text-lg font-semibold text-foreground first:mt-0',
  h3: 'mt-4 mb-2 text-base font-semibold text-foreground first:mt-0',
  h4: 'mt-4 mb-2 text-sm font-semibold text-foreground first:mt-0',
  p: 'my-2 leading-relaxed text-foreground',
  a: 'text-primary underline underline-offset-2 hover:opacity-80',
  ul: 'my-2 list-disc space-y-1 pl-5 text-foreground',
  ol: 'my-2 list-decimal space-y-1 pl-5 text-foreground',
  blockquote: 'my-3 border-l-2 border-border pl-4 italic text-muted-foreground',
  code: 'rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground',
  codeBlock: 'font-mono text-inherit',
  pre: 'my-3 overflow-x-auto rounded-md bg-muted p-4 text-sm',
  hr: 'my-4 border-border',
  table: 'my-3 w-full border-collapse text-sm',
  th: 'border border-border bg-muted px-3 py-1.5 text-left font-semibold',
  td: 'border border-border px-3 py-1.5',
  strong: 'font-semibold text-foreground',
  del: 'text-muted-foreground line-through',
} as const

/**
 * Contextual typing from `Components` gives each override its exact element
 * props; we drop react-markdown's `node` so it never reaches the DOM.
 */
const components: Components = {
  h1: ({ node: _node, ...props }) => <h1 className={CLASSES.h1} {...props} />,
  h2: ({ node: _node, ...props }) => <h2 className={CLASSES.h2} {...props} />,
  h3: ({ node: _node, ...props }) => <h3 className={CLASSES.h3} {...props} />,
  h4: ({ node: _node, ...props }) => <h4 className={CLASSES.h4} {...props} />,
  p: ({ node: _node, ...props }) => <p className={CLASSES.p} {...props} />,
  a: ({ node: _node, ...props }) => (
    <a
      className={CLASSES.a}
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    />
  ),
  ul: ({ node: _node, ...props }) => <ul className={CLASSES.ul} {...props} />,
  ol: ({ node: _node, ...props }) => <ol className={CLASSES.ol} {...props} />,
  blockquote: ({ node: _node, ...props }) => (
    <blockquote className={CLASSES.blockquote} {...props} />
  ),
  pre: ({ node: _node, ...props }) => <pre className={CLASSES.pre} {...props} />,
  hr: ({ node: _node, ...props }) => <hr className={CLASSES.hr} {...props} />,
  table: ({ node: _node, ...props }) => (
    <table className={CLASSES.table} {...props} />
  ),
  th: ({ node: _node, ...props }) => <th className={CLASSES.th} {...props} />,
  td: ({ node: _node, ...props }) => <td className={CLASSES.td} {...props} />,
  strong: ({ node: _node, ...props }) => (
    <strong className={CLASSES.strong} {...props} />
  ),
  del: ({ node: _node, ...props }) => <del className={CLASSES.del} {...props} />,
  code: ({ node: _node, className, ...props }) => {
    // Fenced block code arrives with a `language-*` class and already sits
    // inside the styled <pre> container; inline code gets the pill.
    const inBlock =
      typeof className === 'string' && className.startsWith('language-')
    return (
      <code
        className={inBlock ? CLASSES.codeBlock : CLASSES.code}
        {...props}
      />
    )
  },
}

export default function MarkdownBody({
  source,
  className = '',
}: {
  source: string
  className?: string
}) {
  return (
    <div className={`text-[0.9375rem] leading-relaxed ${className}`}>
      <Markdown components={components}>{source}</Markdown>
    </div>
  )
}
