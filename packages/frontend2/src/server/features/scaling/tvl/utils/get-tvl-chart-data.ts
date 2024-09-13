import { type ValueRecord } from '@l2beat/database'
import { assert, UnixTime } from '@l2beat/shared-pure'
import { type Dictionary } from 'lodash'
import {
  unstable_cache as cache,
  unstable_noStore as noStore,
} from 'next/cache'
import { z } from 'zod'
import { env } from '~/env'
import { generateTimestamps } from '~/server/features/utils/generate-timestamps'
import { getEthPrices } from './get-eth-prices'
import { getTvlProjects } from './get-tvl-projects'
import { getTvlTargetTimestamp } from './get-tvl-target-timestamp'
import { getTvlValuesForProjects } from './get-tvl-values-for-projects'
import {
  TvlProjectFilter,
  createTvlProjectsFilter,
} from './project-filter-utils'
import { TvlChartRange, getRangeConfig } from './range'
import { sumValuesPerSource } from './sum-values-per-source'

export const TvlChartDataParams = z.object({
  range: TvlChartRange,
  filter: TvlProjectFilter,
  excludeAssociatedTokens: z.boolean().optional(),
})

export type TvlChartDataParams = z.infer<typeof TvlChartDataParams>

/**
 * A function that computes values for chart data of the TVL over time.
 * @returns {
 *  total: {
 *    usd: number
 *    eth: number
 *  }
 *  chart: [timestamp, native, canonical, external, ethPrice][] - all numbers
 * }
 */
export async function getTvlChartData(
  ...args: Parameters<typeof getCachedTvlChartData>
) {
  if (env.MOCK) {
    return getMockTvlChartData(...args)
  }
  noStore()
  return getCachedTvlChartData(...args)
}

export type TvlChartData = Awaited<ReturnType<typeof getCachedTvlChartData>>
export const getCachedTvlChartData = cache(
  async ({ range, excludeAssociatedTokens, filter }: TvlChartDataParams) => {
    const projectsFilter = createTvlProjectsFilter(filter)
    const tvlProjects = getTvlProjects().filter(projectsFilter)

    const ethPrices = await getEthPrices()
    const values = await getTvlValuesForProjects(tvlProjects, range)

    const lastWeekValues =
      range === '7d' ? values : await getTvlValuesForProjects(tvlProjects, '7d')
    const lastWeekChart = getChartData(
      lastWeekValues,
      ethPrices,
      !!excludeAssociatedTokens,
    )
    const latestValue = lastWeekChart.at(-1)
    assert(latestValue, 'No latest value')

    const total = latestValue[1] + latestValue[2] + latestValue[3]
    const ethPrice = latestValue[4]

    return {
      total: {
        usd: total / 100,
        eth: total / ethPrice,
      },
      chart: getChartData(values, ethPrices, !!excludeAssociatedTokens),
    }
  },
  ['getTvlChartDataDS'],
  { revalidate: 10 * UnixTime.MINUTE },
)

function getChartData(
  values: Dictionary<Dictionary<ValueRecord[]>>,
  ethPrices: Record<number, number>,
  excludeAssociatedTokens: boolean,
) {
  const timestampValues: Record<string, ValueRecord[]> = {}

  for (const projectValues of Object.values(values)) {
    for (const [timestamp, values] of Object.entries(projectValues)) {
      const map = timestampValues[timestamp] ?? []
      timestampValues[timestamp] = map.concat(values)
    }
  }

  return Object.entries(timestampValues).map(([timestamp, values]) => {
    const summed = sumValuesPerSource(values, {
      forTotal: true,
      excludeAssociatedTokens: !!excludeAssociatedTokens,
    })
    const ethPrice = ethPrices[+timestamp]
    assert(ethPrice, 'No ETH price for ' + timestamp)

    const native = Number(summed.native)
    const canonical = Number(summed.canonical)
    const external = Number(summed.external)

    return [+timestamp, native, canonical, external, ethPrice * 100] as const
  })
}

function getMockTvlChartData({ range }: TvlChartDataParams): TvlChartData {
  const { days, resolution } = getRangeConfig(range)
  const target = getTvlTargetTimestamp().toStartOf(
    resolution === 'hourly' ? 'hour' : 'day',
  )
  const from =
    days !== Infinity ? target.add(-days, 'days') : new UnixTime(1573776000)
  const timestamps = generateTimestamps([from, target], resolution)

  return {
    total: {
      usd: 60,
      eth: 5,
    },
    chart: timestamps.map((timestamp) => {
      return [timestamp.toNumber(), 3000, 2000, 1000, 1200]
    }),
  }
}
