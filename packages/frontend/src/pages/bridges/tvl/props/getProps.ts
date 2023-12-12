import { Config } from '../../../../build/config'
import { getFooterProps, getNavbarProps } from '../../../../components'
import { getChartUrl } from '../../../../scripts/charts/data-controller/ChartDataController'
import { PagesData, Wrapped } from '../../../Page'
import { BridgesTvlPageProps } from '../view/BridgesTvlPage'
import { getBridgesTvlView } from './getBridgesTvlView'
import { getPageMetadata } from './getPageMetadata'

export function getProps(
  config: Config,
  pagesData: PagesData,
): Wrapped<BridgesTvlPageProps> {
  return {
    props: {
      navbar: getNavbarProps(config, 'bridges'),
      tvlView: getBridgesTvlView(
        [...config.bridges, ...config.layer2s],
        pagesData,
      ),
      footer: getFooterProps(config),
    },
    wrapper: {
      preloadApi: getChartUrl({ type: 'bridges-tvl', includeCanonical: false }),
      metadata: getPageMetadata(),
      banner: config.features.banner,
    },
  }
}
