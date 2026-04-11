import type { PortableTextComponents } from '@portabletext/react'

export const portableTextComponents: PortableTextComponents = {
  block: {
    normal: ({ children }) => (
      <p className="text-gray-600 text-base font-light leading-relaxed mb-6 text-justify hyphens-auto">{children}</p>
    ),
    h2: ({ children }) => (
      <h2 className="text-xs tracking-widest uppercase text-gray-300 mt-12 mb-4">{children}</h2>
    ),
    h3: ({ children }) => (
      <h3 className="text-sm font-light text-gray-400 mt-8 mb-3">{children}</h3>
    ),
  },
  list: {
    bullet: ({ children }) => (
      <ul className="mb-6 flex flex-col gap-2 pl-0">{children}</ul>
    ),
    number: ({ children }) => (
      <ol className="mb-6 flex flex-col gap-2 pl-0 list-decimal list-inside">{children}</ol>
    ),
  },
  listItem: {
    bullet: ({ children }) => (
      <li className="text-gray-600 text-base font-light leading-relaxed flex gap-3">
        <span className="text-gray-300 select-none">—</span>
        <span>{children}</span>
      </li>
    ),
  },
  marks: {
    strong: ({ children }) => <strong className="font-medium text-gray-800">{children}</strong>,
    em: ({ children }) => <em className="italic">{children}</em>,
  },
}
