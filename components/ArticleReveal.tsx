'use client'

// Both boneyard-js/react (no "use client" in dist) and framer-motion must live
// in a Client Component boundary. This wrapper combines the entrance animation
// with the Skeleton registration so the intercepting Server Component page
// never imports from either package directly.

import { motion } from 'framer-motion'
import { Skeleton } from 'boneyard-js/react'

export default function ArticleReveal({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
      className="w-full"
    >
      <Skeleton name="article-content" loading={false} animate="shimmer">
        {children}
      </Skeleton>
    </motion.div>
  )
}
