'use client'

interface Props {
  title: string
  subtitle?: string
  onClose: () => void
  children: React.ReactNode
}

export default function PanelChrome({ title, subtitle, onClose, children }: Props) {
  return (
    <div className="bg-white dark:bg-black border border-gray-200 dark:border-gray-800 h-full flex flex-col">
      <div className="flex items-start justify-between p-4 pb-2 border-b border-gray-100 dark:border-gray-900">
        <div className="min-w-0">
          <h2 className="text-sm tracking-widest uppercase font-light text-black dark:text-white truncate">
            {title}
          </h2>
          {subtitle && (
            <span className="text-[10px] tracking-widest uppercase text-gray-400 dark:text-gray-500 block mt-0.5">
              {subtitle}
            </span>
          )}
        </div>
        <button
          data-no-skeleton
          onClick={onClose}
          className="w-12 h-12 flex items-center justify-center text-gray-400 dark:text-gray-500 hover:text-black dark:hover:text-white transition-colors text-lg cursor-pointer shrink-0"
          aria-label="Close panel"
        >
          &times;
        </button>
      </div>
      <div
        className="flex-1 overflow-y-auto"
        style={{ overscrollBehavior: 'contain' }}
      >
        {children}
      </div>
    </div>
  )
}
