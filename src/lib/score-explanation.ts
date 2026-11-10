import { z } from 'zod'

export const scoreExplanationOpening = '请介绍这首乐曲并推荐可核验的拓展资料。'

export const explanationResourcesSchema = z.array(z.object({
  kind: z.enum(['video', 'search', 'official', 'image']),
  title: z.string().min(1).max(180),
  url: z.url({ protocol: /^https$/ }),
  imageUrl: z.url({ protocol: /^https$/ }).optional(),
})).max(12)

export type ExplanationResource = z.infer<typeof explanationResourcesSchema>[number]
