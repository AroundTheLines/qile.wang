'use client'

import { motion } from 'framer-motion'

export default function GlobeArticleReveal({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="w-full h-full overflow-y-auto"
    >
      {children}
    </motion.div>
  )
}
