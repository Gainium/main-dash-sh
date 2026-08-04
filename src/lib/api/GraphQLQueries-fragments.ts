import { isColdStoreArchiveUx } from '@/utils/coldStore';

// Cold-store adds `coldArchived` to the bot GraphQL types. Only REQUEST it once
// the cold-store UX is live (flag on) — a backend that predates the field would
// otherwise 400 the whole bot query. Ships dark: empty selection by default.
const COLD_ARCHIVED_SELECTION = isColdStoreArchiveUx() ? 'coldArchived' : '';

const botSettings = `
    name
    pair
    topPrice
    lowPrice
    levels
    gridStep
    budget
    ordersInAdvance
    useOrderInAdvance
    prioritize
    profitCurrency
    orderFixedIn
    sellDisplacement
    gridType
    tpSl
    tpSlCondition
    tpSlAction
    sl
    slCondition
    slAction
    tpPerc
    slPerc
    tpTopPrice
    slLowPrice
    updatedBudget
    useStartPrice
    startPrice
    marginType
    leverage
    futures
    coinm
    newProfit
    strategy
    futuresStrategy
    tpSlLimit
    slLimit
    feeOrder
    `;

const orders = `
    clientOrderId
    reduceFundsId
    origQty
    executedQty
    price
    side
    status
    time
    transactTime
    type
    updateTime
    botId
    userId
    baseAsset
    quoteAsset
    dealId
    tpSlTarget
    sl
    acBefore
    acAfter
    symbol
    exchange
    typeOrder
`;

const varsFragment = `
list
paths {
path
variable
}
`;

const notEnoughBalanceFragment = `
thresholdPassed`;

const liveGridStatsFragment = `
budget
    value
    valueChange
    valueChangePerc
    avgDaily
    avgDailyPerc
    annualizedReturn
    freePorfit
    freeProfitUsd
    totalProfit
    totalProfitUsd
    tradingTime
    tradingTimeString
`;
const botFragment = `
_id
cost
userId
status
statusReason
${COLD_ARCHIVED_SELECTION}
showErrorWarning
settings {
    ${botSettings}
}
exchange
exchangeUUID
created
updated
initialPrice
workingShift {
    start
    end
}
symbol {
    symbol
    baseAsset
    quoteAsset
}
transactionsCount {
    buy
    sell
}
levels {
    active {
        buy
        sell
    }
    all {
        buy
        sell
    }
}
profit {
    total
    totalUsd
    freeTotal
    freeTotalUsd
}
initialPrice
initialPriceStart
initialPriceFrom
initialPriceStartFrom
initialBalances {
    base
    quote
}
currentBalances {
    base
    quote
}
assets {
    used {
        base
        quote
    }
    required {
        base
        quote
    }
}
lastPrice
avgPrice
usdRate
share
shareId
position {
  qty
  price
  side
}
exchangeUnassigned
vars {${varsFragment}}
notEnoughBalance {${notEnoughBalanceFragment}}
liveStats {${liveGridStatsFragment}}
stats {
drawdownPercent
    runUpPercent
    timeInProfit
    timeInLoss
    trackTime
    timeCountStart
    currentCount
    unrealizedProfit
}
`;

const dcaBotSettingsFragment = `
dcaCondition
    dcaVolumeBaseOn
    dcaVolumeRequiredChange
    dcaVolumeRequiredChangeRef
    dcaVolumeMaxValue
skipBalanceCheck
baseSlOn
closeByTimer
                    closeByTimerValue
                    closeByTimerUnits
                     maxDealsPerHigherTimeframe
  useMaxDealsPerHigherTimeframe
  remainderFullAmount
autoRebalancing
adaptiveClose
    useStaticPriceFilter
    useCooldown
    useVolumeFilterAll
    useDynamicPriceFilter
    dynamicPriceFilterDeviation
    dynamicPriceFilterOverValue
    dynamicPriceFilterUnderValue
    dynamicPriceFilterPriceType
dynamicPriceFilterDirection
useRiskReward
useNoOverlapDeals
  riskSlType
  riskSlAmountPerc
  riskSlAmountValue
  riskUseTpRatio
  riskTpRatio
  riskMinPositionSize
scaleDcaType
  startDealLogic
  stopDealLogic
  stopDealSlLogic
  stopBotLogic
useRiskReduction
  riskReductionValue
  useReinvest
  reinvestValue
startBotPriceCondition
  startBotPriceValue
  stopBotPriceCondition
  stopBotPriceValue
  startBotLogic
   botActualStart
  riskMaxPositionSize
dynamicArLockValue
riskMaxSl
  riskMinSl
dcaCustom {
  uuid
  step
  size
}
pair
                name
                strategy
                profitCurrency
                baseOrderSize
                baseOrderPrice
                useLimitPrice
                startOrderType
                startCondition
                tpPerc
                orderFixedIn
                orderSize
                step
                ordersCount
                activeOrdersCount
                volumeScale
                stepScale
                minimumDeviation
                useTp
                useSmartOrders
                minOpenDeal
                maxOpenDeal
                useDca
                hodlAt
                hodlHourly
                hodlDay
                hodlNextBuy
                maxNumberOfOpenDeals
                useSl
                slPerc
                orderSizeType
                indicatorGroups {
                 id
                 logic
                 action
                 section
                }
                indicators {
                    type
                    uuid
                    indicatorLength
                    indicatorValue
                    indicatorCondition
                    groupId
                    indicatorInterval
                    signal
                    checkLevel
                    condition
                    maType
                    maCrossingValue
                    maCrossingInterval
                    maCrossingLength
                    maUUID
                    bbCrossingValue
                    stochSmoothK
                    stochSmoothD
                    stochUpper
                    stochLower
                    stochRSI
                    srCrossingValue
                    leftBars
                    rightBars
                    basePeriods
                    pumpPeriods
                    pump
                    baseCrack
                    rsiValue
                    rsiValue2
                    stochRange
                    valueInsteadof
                    indicatorAction
                    section
                    psarInc
                    psarMax
                    psarStart
                    minPercFromLast
                    keepConditionBars
                    orderSize
                    voLong
                    voShort
                    uoFast
                    uoMiddle
                    uoSlow
                    momSource
                    bbwpLookback
                    ecdTrigger
                    xOscillator1
                    xOscillator2
                    xOscillator2length
                    xOscillator2Interval
xOscillator2voLong
xOscillator2voShort
                    xoUUID
                    percentile
                    percentileLookback
                    percentilePercentage
                    mar1type
                    mar1length
                    mar2type
                    mar2length
                    bbwMa
                    bbwMaLength
                    bbwMult
                    macdFast
                    macdSlow
                    macdMaSource
                    macdMaSignal
                     divOscillators
  divType
  divMinCount
  trendFilter
  trendFilterLookback
  trendFilterType
  trendFilterValue
  unpnlValue
  unpnlCondition
  dcValue
  obfvgValue
  obfvgRef
  sessionDays
  sessionRule
  lwThreshold
  lwMaxDuration
  lwValue
  lwCondition
  factor
  atrLength
  pcUp
  pcDown
  pcCondition
  pcValue
  ppHighLeft
  ppHighRight
  ppLowLeft
  ppLowRight
  ppMult
  ppValue
  ppType
riskAtrMult
dynamicArFactor
athLookback
kcMa
kcRange
kcRangeLength
  stCondition
                }
                limitTimeout
                useLimitTimeout
                notUseLimitReposition
                cooldownAfterDealStart
                cooldownAfterDealStartUnits
                cooldownAfterDealStartInterval
                cooldownAfterDealStop
                cooldownAfterDealStopUnits
                cooldownAfterDealStopInterval
                cooldownAfterDealStartOption
                cooldownAfterDealStopOption
                moveSL
                moveSLTrigger
                moveSLValue
                moveSLForAll
                trailingSl
                trailingTp
                trailingTpPerc
                useCloseAfterX
                closeAfterX
                useMulti
                maxDealsPerPair
                ignoreStartDeals
                comboTpBase
comboSmartGridsCount
    comboUseSmartGrids
                useBotController
                useCloseAfterXopen
                closeAfterXopen
                useCloseAfterXwin
                closeAfterXwin
                useCloseAfterXloss
                closeAfterXloss
                useCloseAfterXprofit
                closeAfterXprofitValue
                closeAfterXprofitCond
                botStart
                stopType
                stopStatus
                dealCloseCondition
                dealCloseConditionSL
                useMinTP
                minTp
                closeDealType
                terminalDealType
                useMultiTp
                multiTp {
                  target
                  amount
                  uuid
                }
                useMultiSl
                pairPrioritization
                multiSl {
                  target
                  amount
                  uuid
                }
                marginType
                leverage
                futures
                coinm
                useVolumeFilter
                volumeTop
                volumeValue
                useFixedTPPrices
    useFixedSLPrices
fixedTpPrice
fixedSlPrice
    baseStep
    baseGridLevels
    useActiveMinigrids
    comboActiveMinigrids
    comboSlLimit
    comboTpLimit
    useRelativeVolumeFilter
    relativeVolumeTop
    relativeVolumeValue
    feeOrder
`;

const comboBotSettingsFragment = `
dcaCondition
    dcaVolumeBaseOn
    dcaVolumeRequiredChange
    dcaVolumeRequiredChangeRef
    dcaVolumeMaxValue
skipBalanceCheck
baseSlOn
closeByTimer
                    closeByTimerValue
                    closeByTimerUnits
                    maxDealsPerHigherTimeframe
  useMaxDealsPerHigherTimeframe
  remainderFullAmount
autoRebalancing
adaptiveClose
    useStaticPriceFilter
    useCooldown
    useVolumeFilterAll
    useDynamicPriceFilter
    dynamicPriceFilterDeviation
    dynamicPriceFilterOverValue
    dynamicPriceFilterUnderValue
    dynamicPriceFilterPriceType
dynamicPriceFilterDirection
useRiskReward
useNoOverlapDeals
  riskSlType
  riskSlAmountPerc
  riskSlAmountValue
  riskUseTpRatio
  riskTpRatio
  riskMinPositionSize
scaleDcaType
startDealLogic
  stopDealLogic
  stopDealSlLogic
  stopBotLogic
useRiskReduction
  riskReductionValue
  useReinvest
  reinvestValue
startBotPriceCondition
  startBotPriceValue
  stopBotPriceCondition
  stopBotPriceValue
  startBotLogic
   botActualStart
  riskMaxPositionSize
dynamicArLockValue
riskMaxSl
  riskMinSl
dcaCustom {
  uuid
  step
  size
}
pair
                name
                strategy
                profitCurrency
                baseOrderSize
                baseOrderPrice
                useLimitPrice
                startOrderType
                startCondition
                tpPerc
                orderFixedIn
                orderSize
                step
                ordersCount
                activeOrdersCount
                volumeScale
                stepScale
                minimumDeviation
                useTp
                useSmartOrders
                minOpenDeal
                maxOpenDeal
                useDca
                hodlAt
                hodlHourly
                hodlDay
                hodlNextBuy
                maxNumberOfOpenDeals
                useSl
                slPerc
                orderSizeType
                indicatorGroups {
                 id
                 logic
                 action
                 section
                }
                indicators {
                    type
                    uuid
                    indicatorLength
                    indicatorValue
                    indicatorCondition
                    indicatorInterval
                    groupId
                    signal
                    checkLevel
                    condition
                    maType
                    maCrossingValue
                    maCrossingInterval
                    maCrossingLength
                    maUUID
                    bbCrossingValue
                    stochSmoothK
                    stochSmoothD
                    stochUpper
                    stochLower
                    stochRSI
                    srCrossingValue
                    leftBars
                    rightBars
                    basePeriods
                    pumpPeriods
                    pump
                    baseCrack
                    rsiValue
                    rsiValue2
                    stochRange
                    valueInsteadof
                    indicatorAction
                    section
                    psarInc
                    psarMax
                    psarStart
                    minPercFromLast
                    keepConditionBars
                    orderSize
                    voLong
                    voShort
                    uoFast
                    uoMiddle
                    uoSlow
                    momSource
                    bbwpLookback
                    ecdTrigger
                    xOscillator1
                    xOscillator2
                    xOscillator2length
                    xOscillator2Interval
xOscillator2voLong
xOscillator2voShort
                    xoUUID
                    percentile
                    percentileLookback
                    percentilePercentage
                    mar1type
                    mar1length
                    mar2type
                    mar2length
                    bbwMa
                    bbwMaLength
                    bbwMult
                    macdFast
                    macdSlow
                    macdMaSource
                    macdMaSignal
                    divOscillators
  divType
  divMinCount
   trendFilter
  trendFilterLookback
  trendFilterType
  trendFilterValue
  unpnlValue
  unpnlCondition
  dcValue
  obfvgValue
  obfvgRef
  sessionDays
  sessionRule
  lwThreshold
  lwMaxDuration
  lwValue
  lwCondition
    factor
  atrLength
   pcUp
  pcDown
  pcCondition
  pcValue
  ppHighLeft
  ppHighRight
  ppLowLeft
  ppLowRight
  ppMult
  ppValue
  ppType
riskAtrMult
dynamicArFactor
athLookback
kcMa
kcRange
kcRangeLength
  stCondition
                }
                limitTimeout
                useLimitTimeout
                notUseLimitReposition
                cooldownAfterDealStart
                cooldownAfterDealStartUnits
                cooldownAfterDealStartInterval
                cooldownAfterDealStop
                cooldownAfterDealStopUnits
                cooldownAfterDealStopInterval
                cooldownAfterDealStartOption
                cooldownAfterDealStopOption
                moveSL
                moveSLTrigger
                moveSLValue
                moveSLForAll
                trailingSl
                trailingTp
                trailingTpPerc
                useCloseAfterX
                closeAfterX
                useMulti
                maxDealsPerPair
                ignoreStartDeals
                comboTpBase
comboSmartGridsCount
    comboUseSmartGrids
                useBotController
                useCloseAfterXopen
                closeAfterXopen
useCloseAfterXwin
                closeAfterXwin
                useCloseAfterXloss
                closeAfterXloss
                useCloseAfterXprofit
                closeAfterXprofitValue
                closeAfterXprofitCond
                botStart
                stopType
                stopStatus
                dealCloseCondition
                dealCloseConditionSL
                useMinTP
                minTp
                closeDealType
                terminalDealType
                useMultiTp
                multiTp {
                  target
                  amount
                  uuid
                }
                useMultiSl
                pairPrioritization
                multiSl {
                  target
                  amount
                  uuid
                }
                marginType
                leverage
                futures
                coinm
                gridLevel
                feeOrder
                useVolumeFilter
                volumeTop
                volumeValue
                useFixedTPPrices
    useFixedSLPrices
fixedTpPrice
fixedSlPrice
      baseStep
  baseGridLevels
  useActiveMinigrids
  comboActiveMinigrids
  comboSlLimit
    comboTpLimit
    useRelativeVolumeFilter
    relativeVolumeTop
    relativeVolumeValue
`;

const comboBotByIdSettingsFragment = `
settings {
                                ${comboBotSettingsFragment}
                            }
                            exchange
                            exchangeUUID
                            baseAsset
                            quoteAsset
                            created
                            updated
                            vars {${varsFragment}}
                            `;

const dcaMultiBotSettingsFragment = `
pairs
                name
                strategy
                profitCurrency
                baseOrderSize
                baseOrderPrice
                useLimitPrice
                startOrderType
                startCondition
                tpPerc
                orderFixedIn
                orderSize
                step
                ordersCount
                activeOrdersCount
                volumeScale
                stepScale
                useTp
                useSmartOrders
                minOpenDeal
                maxOpenDeal
                useDca
                hodlAt
                hodlHourly
                hodlDay
                hodlNextBuy
                maxNumberOfOpenDeals
                useSl
                slPerc
                orderSizeType
                indicatorGroups {
                 id
                 logic
                 action
                 section
                }
                indicators {
                    type
                    uuid
                    indicatorLength
                    indicatorValue
                    indicatorCondition
                    indicatorInterval
                    groupId
                    signal
                    checkLevel
                    condition
                    maType
                    maCrossingValue
                    maCrossingInterval
                    maCrossingLength
                    maUUID
                    bbCrossingValue
                    stochSmoothK
                    stochSmoothD
                    stochUpper
                    stochLower
                    stochRSI
                    srCrossingValue
                    leftBars
                    rightBars
                    basePeriods
                    pumpPeriods
                    pump
                    baseCrack
                }
                limitTimeout
                useLimitTimeout
                notUseLimitReposition
                maxDealsPerPair
                ignoreStartDeals
                comboTpBase
comboSmartGridsCount
    comboUseSmartGrids
`;

const dcaDealFragment = `
paperContext
flags
closeTrigger
tpFilledHistory {
  id
  qty
  price
}
note
                _id
                botId
                userId
                status
                initialBalances {
                    base
                    quote
                }
                currentBalances {
                    base
                    quote
                }
                initialPrice
                lastPrice
                profit {
                    total
                    totalUsd
                    pureBase
                    pureQuote
                }
                funding {
                    total
                    totalUsd
                    lastTime
                }
                feePaid {
                  base
                  quote
                }
                avgPrice
                displayAvg
                commission
                createTime
                updateTime
                closeTime
                levels {
                    all
                    complete
                }
                usage {
                    current {
                        base
                        quote
                    }
                    max {
                        base
                        quote
                    }
                }
                settings {
                    dcaCondition
    dcaVolumeBaseOn
    dcaVolumeRequiredChange
    dcaVolumeRequiredChangeRef
    dcaVolumeMaxValue
baseSlOn
                    closeByTimer
                    closeByTimerValue
                    closeByTimerUnits
                    dcaCustom {
                      uuid
                      step
                      size
                    }
                    ordersCount
                    tpPerc
                    slPerc
                    profitCurrency
                    avgPrice
                    baseOrderSize
                    baseOrderPrice
                    useLimitPrice
                    startOrderType
                    orderSize
                    useTp
                    useSl
                    useDca
                    useSmartOrders
                    activeOrdersCount
                    trailingSl
                    moveSL
                    moveSLTrigger
                    moveSLValue
                    moveSLForAll
                    dealCloseCondition
                    trailingTp
                    trailingTpPerc
                    useMinTP
                    minTp
                    closeDealType
                    orderSizeType
                    useMultiSl
                    multiSl {
                      target
                      amount
                      uuid
                    }
                    useMultiTp
                    multiTp {
                      target
                      amount
                      uuid
                    }
                    volumeScale
                    stepScale
                    minimumDeviation
                    avgPrice
                    changed
                    orderSizePercQty
                    step
                    dealCloseConditionSL
                    futures
                    coinm
                    marginType
                    leverage
                    useFixedTPPrices
    useFixedSLPrices
fixedTpPrice
fixedSlPrice
    feeOrder
                }
                assets {
                    used {
                        base
                        quote
                    }
                    required {
                        base
                        quote
                    }
                }
                dcaBot {
                    settings {
                        ${dcaBotSettingsFragment}
                    }
                    symbol {
                        symbol
                        baseAsset
                        quoteAsset
                    }
                }
                gridBreakpoints{
                    price
                    displacedPrice
                }
                strategy
                exchange
                exchangeUUID
                symbol {
                  baseAsset
                  quoteAsset
                  symbol
                }
                trailingLevel
                trailingMode
                bestPrice
                stats {
                  drawdownPercent
                  runUpPercent
                  timeInProfit
                  timeInLoss
                  trackTime
                  timeCountStart
                  currentCount
                  unrealizedProfit
                }
                tpSlTargetFilled
                dynamicAr {
                  value
                  id
                }
                funds {
                  price
                  qty
                }
                reduceFunds {
                  price
                  qty
                }
                pendingAddFunds {
                  qty
                  useLimitPrice
                  limitPrice
                  asset
                  id
                  type
                }
                pendingReduceFunds {
                  qty
                  useLimitPrice
                  limitPrice
                  asset
                  id
                  type
                }
                blockOrders {
                  price
                  qty
                  side
                }
                moveSlActivated
                parent
                cost
                size
                 sizes {
                    base
                    dca
                    origBase
                    origDca
                  }
                    ac {
                      before
                      after
                    }
            `;

const comboDealFragment = `
paperContext
parentBotId
note
moveSlActivated
                _id
                botId
                userId
                status
                initialBalances {
                    base
                    quote
                }
                currentBalances {
                    base
                    quote
                }
                initialPrice
                lastPrice
                profit {
                    total
                    totalUsd
                    pureBase
                    pureQuote
                    gridProfit
                    gridProfitUsd
                }
                funding {
                    total
                    totalUsd
                    lastTime
                }
                feePaid {
                  base
                  quote
                }
                avgPrice
                displayAvg
                commission
                createTime
                updateTime
                closeTime
                levels {
                    all
                    complete
                }
                usage {
                    current {
                        base
                        quote
                    }
                    max {
                        base
                        quote
                    }
                }
                settings {
                    dcaCondition
    dcaVolumeBaseOn
    dcaVolumeRequiredChange
    dcaVolumeRequiredChangeRef
    dcaVolumeMaxValue
baseSlOn
                    closeByTimer
                    closeByTimerValue
                    closeByTimerUnits
                    dcaCustom {
                      uuid
                      step
                      size
                    }
                    ordersCount
                    tpPerc
                    slPerc
                    profitCurrency
                    avgPrice
                    baseOrderSize
                    baseOrderPrice
                    useLimitPrice
                    startOrderType
                    orderSize
                    useTp
                    useSl
                    useDca
                    useSmartOrders
                    activeOrdersCount
                    trailingSl
                    moveSL
                    moveSLTrigger
                    moveSLValue
                    moveSLForAll
                    dealCloseCondition
                    trailingTp
                    trailingTpPerc
                    useMinTP
                    minTp
                    closeDealType
                    orderSizeType
                    useMultiSl
                    multiSl {
                      target
                      amount
                      uuid
                    }
                    useMultiTp
                    multiTp {
                      target
                      amount
                      uuid
                    }
                    volumeScale
                    stepScale
                    avgPrice
                    changed
                    orderSizePercQty
                    step
                    dealCloseConditionSL
                    futures
                    coinm
                    marginType
                    leverage
                    gridLevel
                    feeOrder
                    useFixedTPPrices
    useFixedSLPrices
fixedTpPrice
fixedSlPrice
    updatedComboAdjustments
    comboTpBase
comboSmartGridsCount
    comboUseSmartGrids
                }
                assets {
                    used {
                        base
                        quote
                    }
                    required {
                        base
                        quote
                    }
                }
                dcaBot {
                    settings {
                        ${dcaBotSettingsFragment}
                    }
                    symbol {
                        symbol
                        baseAsset
                        quoteAsset
                    }
                }
                gridBreakpoints{
                    price
                    displacedPrice
                }
                strategy
                exchange
                exchangeUUID
                symbol {
                  baseAsset
                  quoteAsset
                  symbol
                }
                trailingLevel
                trailingMode
                bestPrice
                stats {
                  drawdownPercent
                  runUpPercent
                  timeInProfit
                  timeInLoss
                  trackTime
                  timeCountStart
                  currentCount
                  unrealizedProfit
                }
                tpSlTargetFilled
                dynamicAr {
                  value
                  id
                }
                cost
                size
                feeBalance
                transactions {
                  buy
                  sell
                }
                  sizes {
                    base
                    dca
                    origBase
                    origDca
                  }
                    tags
                    ac {
                      before
                      after
                    }
                      flags
                      closeTrigger
            `;

const keyValue = `
      key
      value
    `;

const usdAsset = `{
                    usd
                    asset
                  }`;

const statsSeries = `{
    count
    value ${usdAsset}
    minValue ${usdAsset}
    maxValue ${usdAsset}
    perc
  }`;

const statsFragment = `{
              numerical {
                profit {
                  grossProfit ${usdAsset}
                  grossProfitPerc
                  maxDealProfit ${usdAsset}
                  maxDealProfitPerc
                  avgDealProfit ${usdAsset}
                  avgDealProfitPerc
                  maxRunUp ${usdAsset}
                  maxRunUpPerc
                  maxConsecutiveWins
                  standardDeviationOfPositiveReturns
                  series ${statsSeries}
                }
                loss {
                  grossLoss ${usdAsset}
                  grossLossPerc
                  maxDealLoss ${usdAsset}
                  maxDealLossPerc
                  avgDealLoss ${usdAsset}
                  avgDealLossPerc
                  maxDrawdown ${usdAsset}
                  maxDrawdownPerc
                  maxEquityDrawdown ${usdAsset}
                  maxEquityDrawdownPerc
                  maxConsecutiveLosses
                  standardDeviationOfNegativeReturns
                  standardDeviationOfDownside
                  series ${statsSeries}
                  seriesEquity {
                    value
                    min
                    max
                    perc
                  }
                }
                general {
                  netProfitPerc
                  avgDaily ${usdAsset}
                  avgDailyPerc
                  annualizedReturn
                  startBalance ${usdAsset}
                  maxDCAOrdersTriggered
                  avgDCAOrdersTriggered
                  coveredPriceDeviation
                  actualPriceDeviation
                  confidenceGrade
                }
                ratios {
                  profitFactor
                  sharpeRatio
                  sortinoRatio
                  cwr
                  buyAndHold {
                    result
                    perc
                    symbol
                    startPrice
                  }
                }
                usage {
                  maxTheoreticalUsage
                  maxActualUsage
                  avgDealUsage
                }
                deals {
                  profit
                  loss
                }
              }
              duration {
                profit {
                  avgWinningTradeDuration
                  maxWinningTradeDuration
                }
                loss {
                  avgLosingTradeDuration
                  maxLosingTradeDuration
                }
                general {
                  maxDealDuration
                  avgDealDuration
                  dealsPerDay
                  workingTime
                }
              }
              chart {
                realizedProfit
                buyAndHold
                equity
                time
              }
            }`;

const symbolsStatsFragment = `{
    numerical {
      deals {
        profit
        loss
      }
      general {
        startBalance ${usdAsset}
        netProfit ${usdAsset}
        netProfitPerc
        dailyProfit ${usdAsset}
        dailyProfitPerc
        winRate
        profitFactor
      }
    }
    duration {
      maxDealDuration
      avgDealDuration
    }
    symbol
  }`;

const liveStatsFragment = `
currentCost
  maxCost
  relativeCost
  relativeCostString
  totalProfit
  relativeProfit
  value
  relativeValue
  avgDaily
  avgDailyRelative
  annualizedReturn
  tradingTimeString
  tradingTimeNumber
  dealsTotal
`;

const dcaBotFragment = `
            _id
            cost
            userId
            status
            statusReason
            ${COLD_ARCHIVED_SELECTION}
            showErrorWarning
            uuid
            settings {
                ${dcaBotSettingsFragment}
            }
            exchange
            exchangeUUID
            created
            updated
            workingShift {
                start
                end
            }
            initialBalances {
                base {
                  ${keyValue}
                }
                quote {
                  ${keyValue}
                }
            }
            currentBalances {
                base {
                  ${keyValue}
                }
                quote {
                  ${keyValue}
                }
            }
            profit {
                total
                totalUsd
                pureBase
                pureQuote
            }
            symbol {
              key
              value {
                symbol
                baseAsset
                quoteAsset
              }
            }
            profitToday {
                start
                end
                totalToday
                totalTodayUsd
            }
            public
            assets {
                used {
                    base {
                      ${keyValue}
                    }
                    quote {
                      ${keyValue}
                    }
                }
                required {
                    base {
                      ${keyValue}
                    }
                    quote {
                      ${keyValue}
                    }
                }
            }
            usage {
                current {
                    base
                    quote
                }
                max {
                    base
                    quote
                }
                    currentUsd
                maxUsd
                relative
            }
            dealsInBot {
                active
                all
            }
            flags
            share
            shareId
            exchangeUnassigned
            vars {${varsFragment}}
            hodlIgnoreAt
            stats ${statsFragment}
            symbolStats ${symbolsStatsFragment}
            notEnoughBalance {${notEnoughBalanceFragment}}
            liveStats {${liveStatsFragment}}
`;

// Minimal `stats` slice the Trading Bots cards need: `BotCard` renders its
// equity mini-chart from `bot.stats.chart` and reads ONLY `equity` + `time`
// off each point (see `BotCard.tsx` -> `equityChartData`). `realizedProfit` /
// `buyAndHold` are drawer-only, so they stay out of the list payload.
const listChartStatsFragment = `{
              chart {
                equity
                time
              }
            }`;

// List-context slim fragment for `dcaBotList`. The Trading Bots list renders
// hundreds of DCA bots at once; the full `dcaBotFragment` ships per-bot
// time-series arrays (`stats.numerical.{profit,loss}.series`,
// `loss.seriesEquity`) and a per-symbol `symbolStats` object — none of which
// the list/card/table/summary read. Those stay dropped, and the single-bot
// drawer path still uses `getDCABot` (which keeps the full `dcaBotFragment`).
//
// `stats.chart` however is NOT droppable: it is the only source for the card's
// equity mini-chart on COLD LOAD. The `bot stats update` websocket stream is an
// *update* channel, not a hydration one — main-app only emits it when a bot
// recomputes its stats (`core/src/bot/dcaHelper.ts`), so a bot that has not
// closed a deal since page load never ticks and its card stayed permanently
// blank. Stripping `stats` wholesale is what caused that regression, so we
// re-request a chart-only slice here instead of the whole block.
// Measured on a 482-bot account: full `stats` = ~2.54 MB, this chart-only
// slice = ~918 KB, i.e. most of the payload saving is retained.
// `liveStats` is kept: the value/uPnL transforms in `dcaBot.ts` read it from
// the list bot.
const dcaBotListFragment = dcaBotFragment
  .replace(`stats ${statsFragment}`, `stats ${listChartStatsFragment}`)
  .replace(`symbolStats ${symbolsStatsFragment}`, '');

const comboBotFragment = `
            _id
            cost
            userId
            status
            statusReason
            ${COLD_ARCHIVED_SELECTION}
            showErrorWarning
            uuid
            settings {
                ${comboBotSettingsFragment}
            }
            exchange
            exchangeUUID
            created
            updated
            workingShift {
                start
                end
            }
            initialBalances {
                base {
                  ${keyValue}
                }
                quote {
                  ${keyValue}
                }
            }
            currentBalances {
                base {
                  ${keyValue}
                }
                quote {
                  ${keyValue}
                }
            }
            profit {
                total
                totalUsd
                pureBase
                pureQuote
            }
            unrealizedProfit
            symbol {
              key
              value {
                symbol
                baseAsset
                quoteAsset
              }
            }
            profitToday {
                start
                end
                totalToday
                totalTodayUsd
            }
            public
            assets {
                used {
                    base {
                      ${keyValue}
                    }
                    quote {
                      ${keyValue}
                    }
                }
                required {
                    base {
                      ${keyValue}
                    }
                    quote {
                      ${keyValue}
                    }
                }
            }
            usage {
                current {
                    base
                    quote
                }
                currentUsd
                max {
                    base
                    quote
                }
            }
            dealsInBot {
                active
                all
            }
            flags
            share
            shareId
            exchangeUnassigned
            vars {${varsFragment}}
            useAssets
            dealsStatsForBot {
              dealId
              avgPrice
              usage {
                current {
                  base
                  quote
                }
                currentUsd
                max {
                  base
                  quote
                }
              }
              profit {
                total
                totalUsd
                pureBase
                pureQuote
              }
              feePaid {
                base
                quote
              }
              symbol
              currentBalances {
                base
                quote
              }
              initialBalances {
                base
                quote
              }
              comboTpBase
comboSmartGridsCount
    comboUseSmartGrids
            }
            hodlIgnoreAt
            stats ${statsFragment}
            symbolStats ${symbolsStatsFragment}
            notEnoughBalance {${notEnoughBalanceFragment}}
            liveStats {${liveStatsFragment}}
`;

const sharedSettings = `
useTp
        useSl
        tpPerc
        slPerc
        comboTpBase
        comboTpLimit
        comboSlLimit
        dealCloseConditionSL
        dealCloseCondition`;

const hedgeComboBotFragment = `
    _id
    cost
    created
    updated
    paperContext
    profitByAssets {
      asset
      total
      totalUsd
    }
    public
    share
    shareId
    showErrorWarning
    status
    statusReason
    userId
    workingShift {
      start
      end
    }
    bots {${comboBotFragment}}
    symbol {
      key
      value {
        symbol
        baseAsset
        quoteAsset
      }
    }
    profit {
      total
      totalUsd
      freeTotal
      freeTotalUsd
      pureBase
      pureQuote
      gridProfit
      gridProfitUsd
    }
    dealsInBot {
      active
      all
    }
    stats ${statsFragment}
    symbolStats ${symbolsStatsFragment}
    flags
    initialBalances {
      long {
        base {${keyValue}}
        quote {${keyValue}}
      }
      short {
        base {${keyValue}}
        quote {${keyValue}}
      }
    }
    currentBalances {
      long {
        base {${keyValue}}
        quote {${keyValue}}
      }
      short {
        base {${keyValue}}
        quote {${keyValue}}
      }
    }
    assets {
      long {
        used {
          base {${keyValue}}
          quote {${keyValue}}
        }
        required {
          base {${keyValue}}
          quote {${keyValue}}
        }
      }
      short {
        used {
          base {${keyValue}}
          quote{${keyValue}}
        }
        required {
          base {${keyValue}}
          quote {${keyValue}}
        }
      }
    }
      uuid
      sharedSettings {
        ${sharedSettings}
      }
`;

const dcaMultiBotFragment = `
            _id
            userId
            status
            statusReason
            ${COLD_ARCHIVED_SELECTION}
            showErrorWarning
            uuid
            settings {
                ${dcaMultiBotSettingsFragment}
            }
            exchange
            exchangeUUID
            created
            updated
            workingShift {
                start
                end
            }
            initialBaseBalances {
                key
                value
            }
            currentBaseBalances {
                key
                value
            }
            currentQuoteBalances {
              key
              value
            }
            initialQuoteBalances {
              key
              value
            }
            usdRate {
              key
              value
            }
            lastUsdRate {
              key
              value
            }
            lastPrice {
              key
              value
            }
            profit {
                  total
                  totalUsd
            }
            symbols {
              key
              value {
                symbol
                baseAsset
                quoteAsset
              }
            }
            profitToday {
                start
                end
                totalToday
                totalTodayUsd
            }
            baseAssets {
              key
              value {
                used
                required
              }
            }
            quoteAssets {
              key
              value {
                used
                required
              }
            }
            public
            usage {
              current {
                  base
                  quote
              }
              max {
                  base
                  quote
              }
            }
            dealsInBot {
              active
              all
            }
            share
            shareId

`;

const exchangeFragment = `
key
provider
name
uuid
status
hedge
zeroFee
linkedTo
balance
keysType
okxSource
bybitHost
updateTime
lastUpdated
waitingForConfirmation
affiliate
subaccount
rotationRequired
`;

const shortExchangeFragment = `
provider
name
uuid
linkedTo
zeroFee
affiliate
`;

const financialBacktest = `netProfitTotal
                                netProfitTotalUsd
                                grossProfit
                                grossProfitUsd
                                grossLoss
                                grossLossUsd
                                avgGrossProfit
                                avgGrossProfitUsd
                                avgGrossLoss
                                avgGrossLossUsd
                                avgNetProfit
                                avgNetProfitUsd
                                avgNetDaily
                                avgNetDailyUsd
                                unrealizedPnL
                                unrealizedPnLUsd
                                unrealizedPnLPerc
                                maxDealProfit
                                maxDealLoss
                                maxDealProfitUsd
                                maxDealLossUsd
                                maxRunUp
                                maxRunUpUsd
                                maxDrawDown
                                maxDrawDownUsd
                                maxDrawDownEquityUsd
                                maxDrawDownEquityPerc
                                netProfitTotalPerc
                                grossProfitPerc
                                grossLossPerc
                                avgGrossProfitPerc
                                avgGrossLossPerc
                                avgNetProfitPerc
                                avgNetDailyPerc
                                annualizedReturn
                                maxDealProfitPerc
                                maxDealLossPerc
                                maxRunUpPerc
                                maxDrawDownPerc`;

const durationBacktest = `avgDealDuration
                                avgSplitDealDuration {
                                    d
                                    h
                                    min
                                    s
                                }
                                firstDataTime
                                lastDataTime
                                loadingDataTime
                                processingDataTime
                                botWorkingTime {
                                    d
                                    h
                                    min
                                    s
                                }
                                botWorkingTimeNumber
                                maxDealDuration {
                                    d
                                    h
                                    min
                                    s
                                }
                                periodName
                                avgWinningTrade
                                maxWinningTrade
                                avgLosingTrade
                                maxLosingTrade`;

const usageBacktest = `maxTheoreticalUsage
                                maxRealUsage
                                avgRealUsage
                                maxTheoreticalUsageWithRate`;

const numericalBacktest = `all
                                profit
                                loss
                                open
                                closed
                                maxConsecutiveWins
                                maxConsecutiveLosses
                                maxDCATriggered
                                avgDCATriggered`;

const bnhRatio = `value
                                valueUsd
                                perc`;

const ratiosBacktest = `profitFactor
                                profitByPeriod
                                buyAndHold {
                                    ${bnhRatio}
                                }
                                periodRatio
                                sharpe
                                sortino
                                cwr`;

const symbolStatsBacktest = `pair
                                profitAsset
                                winRate
                                profitFactor
                                maxDealDuration {
                                  d
                                  h
                                  min
                                  s
                                }
                                avgDealDuration {
                                  d
                                  h
                                  min
                                  s
                                }
                                deals {
                                  profit
                                  loss
                                }
                                netProfit {
                                  total
                                  totalUsd
                                }
                                dailyReturn {
                                  total
                                  totalUsd
                                }`;

const periodicStatsBacktest = `period
                                startTime
                                netResult
                                drawdown
                                runup
                                deals {
                                  profit
                                  loss
                                }`;

const backtestConfig = `userFee
                                slippage
                                firstDataTime
                                lastDataTime
                                RFR
                                MAR
                                usage
                                pair
                                multiIdependent
                                multiCombined`;

const backtest = `_id
maxLeverage
noData
serverSide
                            financial {
                                ${financialBacktest}
                            }
                            duration {
                                ${durationBacktest}
                            }
                            usage {
                                ${usageBacktest}
                            }
                            numerical {
                                ${numericalBacktest}
                            }
                            ratios {
                                ${ratiosBacktest}
                            }
                            interval
                            quoteRate
                            symbol
                            baseAsset
                            quoteAsset
                            time
                            exchange
                            exchangeUUID
                            settings {
                                ${dcaBotSettingsFragment}
                            }
                            savePermanent
                            shareId
                            userId
                            value
                            author
                            sent
                            config  {
                              ${backtestConfig}
                            }
                            note
                            multi
                            multiPairs
                            symbolStats {
                              ${symbolStatsBacktest}
                            }

    messages
periodicStats {
                              ${periodicStatsBacktest}}`;

const comboBacktest = `_id
maxLeverage
noData
serverSide
                            financial {
                                netProfitTotal
                                netProfitTotalUsd
                                grossProfit
                                grossProfitUsd
                                grossLoss
                                grossLossUsd
                                avgGrossProfit
                                avgGrossProfitUsd
                                avgGrossLoss
                                avgGrossLossUsd
                                avgNetProfit
                                avgNetProfitUsd
                                avgNetDaily
                                avgNetDailyUsd
                                unrealizedPnL
                                unrealizedPnLUsd
                                unrealizedPnLPerc
                                maxDealProfit
                                maxDealLoss
                                maxDealProfitUsd
                                maxDealLossUsd
                                maxRunUp
                                maxRunUpUsd
                                maxDrawDown
                                maxDrawDownUsd
                                maxDrawDownEquityUsd
                                maxDrawDownEquityPerc
                                netProfitTotalPerc
                                grossProfitPerc
                                grossLossPerc
                                avgGrossProfitPerc
                                avgGrossLossPerc
                                avgNetProfitPerc
                                avgNetDailyPerc
                                annualizedReturn
                                maxDealProfitPerc
                                maxDealLossPerc
                                maxRunUpPerc
                                maxDrawDownPerc
                                initialBalanceUsd
                                stDevWinningTrade
                                stDevLosingTrade
                                stDownDevLosingTrade
                            }
                            duration {
                                avgDealDuration
                                avgSplitDealDuration {
                                    d
                                    h
                                    min
                                    s
                                }
                                firstDataTime
                                lastDataTime
                                loadingDataTime
                                processingDataTime
                                botWorkingTime {
                                    d
                                    h
                                    min
                                    s
                                }
                                botWorkingTimeNumber
                                maxDealDuration {
                                    d
                                    h
                                    min
                                    s
                                }
                                periodName
                                avgWinningTrade
                                maxWinningTrade
                                avgLosingTrade
                                maxLosingTrade
                            }
                            usage {
                                maxTheoreticalUsage
                                maxRealUsage
                                avgRealUsage
                            }
                            numerical {
                                all
                                profit
                                loss
                                open
                                closed
                                maxConsecutiveWins
                                maxConsecutiveLosses
                                maxDCATriggered
                                avgDCATriggered
                                dealsPerDay
                                coveredPriceDeviation
                                actualPriceDeviation
                                liquidationEvents
                                confidenceGrade
                                dealsForConfidenceGrade
                                priceDeviation
                            }
                            ratios {
                                profitFactor
                                profitByPeriod
                                buyAndHold {
                                    value
                                    valueUsd
                                    perc
                                }
                                periodRatio
                                sharpe
                                sortino
                                cwr
                            }
                            interval
                            quoteRate
                            symbol
                            baseAsset
                            quoteAsset
                            time
                            exchange
                            exchangeUUID
                            settings {
                                ${comboBotSettingsFragment}
                            }
                            savePermanent
                            shareId
                            userId
                            value
                            author
                            sent
                            config  {
                              userFee
                              slippage
                              firstDataTime
                              lastDataTime
                              RFR
                              MAR
                              usage
                              pair
                              multiIdependent
                              multiCombined
                            }
                            note
                            multi
                            multiPairs
                            symbolStats {
                              pair
                              deals {
                                profit
                                loss
                                open
                              }
                              netProfit {
                                total
                                totalUsd
                              }
                              dailyReturn {
                                total
                                totalUsd
                              }
                              profitAsset
                              winRate
                              profitFactor
                              maxDealDuration {
                                    d
                                    h
                                    min
                                    s
                                }
                              avgDealDuration{
                                    d
                                    h
                                    min
                                    s
                                }
                            }

    messages
periodicStats {
                              deals {
                                profit
                                loss
                              }
                              period
  startTime
  netResult
  drawdown
  runup
                            }
                            `;

const gridBacktest = `_id
maxLeverage
noData
serverSide
                            financial {
                                profitTotal
                                profitTotalUsd
                                budgetUsd
                                avgNetDaily
                                avgNetDailyUsd
                                avgTransactionProfit
                                avgTransactionProfitUsd
                                initialBalances
                                initialBalancesUsd
                                currentBalances
                                currentBalancesUsd
                                valueChange
                                valueChangeUsd
                                startPrice
                                lastPrice
                                breakevenPrice
                                initialBalancesByAsset{
                                  base
                                  quote
                                }
                                currentBalancesByAsset{
                                  base
                                  quote
                                }
                                profitTotalPerc
                                avgNetDailyPerc
                                annualizedReturn
                                valueChangePerc
                                avgTransactionProfitPerc
                            }
                            duration {
                                firstDataTime
                                lastDataTime
                                loadingDataTime
                                processingDataTime
                                botWorkingTime {
                                    d
                                    h
                                    min
                                    s
                                }
                                botWorkingTimeNumber
                                periodName
                            }
                            numerical {
                                all
                                transactionsPerDay
                                buy
                                sell
                            }
                            ratios {
                                profitByPeriod
                                buyAndHold {
                                    value
                                    valueUsd
                                    perc
                                }
                                periodRatio
                                sharpe
                                sortino
                                cwr
                            }
                            interval
                            quoteRate
                            symbol
                            baseAsset
                            quoteAsset
                            time
                            exchange
                            exchangeUUID
                            settings {
                                ${botSettings}
                            }
                            savePermanent
                            shareId
                            position {
                              qty
                              side
                              price
                              count
                              pnl {
                                perc
                                value
                              }
                            }
                            userId
                            value
                            author
                            sent
                            config  {
                              userFee
                              slippage
                              firstDataTime
                              lastDataTime
                              RFR
                              MAR
                              usage
                              pair
                              multiIdependent
                              multiCombined
                            }
                            note`;

const period = `name
                              from
                              to
                              uuid`;

const minigridSchema = `_id
botId
    userId
    dealId
    dcaOrderId
    grids {
      buy
      sell
    }
    status
    initialBalances {
      base
      quote
    }
    currentBalances{
      base
      quote
    }
    initialPrice
    realInitialPrice
    lastPrice
    profit {
      total
      totalUsd
      pureBase
      pureQuote
    }
    avgPrice
    createTime
    updateTime
    closeTime
    assets {
      used {
        base
        quote
      }
      required {
        base
        quote
      }
    }
    paperContext
    exchange
    exchangeUUID
    symbol {
      symbol
      baseAsset
      quoteAsset
    }
    settings {
      topPrice
      lowPrice
      levels
      budget
      sellDisplacement
      profitCurrency
      quoteFixedIn
    }
    transactions {
      buy
      sell
    }`;

const payout = `
_id
                            userId
                            status
                            amount
                            txUrl
                            reason
                            created
                            updated
                        `;

const credits = `
                                  paid
                                  subscription {
                                    amount
                                    arrived
                                    expired
                                  }
                                  blocked
                                `;

const apiKeysFragment = `
                                created
                            expired
                            permission
                            name
                            _id
                            paperContext
                            botId`;

// Export all fragments
export {
  apiKeysFragment,
  backtest,
  backtestConfig,
  bnhRatio,
  botFragment,
  botSettings,
  comboBacktest,
  comboBotByIdSettingsFragment,
  comboBotFragment,
  comboBotSettingsFragment,
  comboDealFragment,
  credits,
  dcaBotFragment,
  dcaBotListFragment,
  dcaBotSettingsFragment,
  dcaDealFragment,
  dcaMultiBotFragment,
  dcaMultiBotSettingsFragment,
  durationBacktest,
  exchangeFragment,
  financialBacktest,
  gridBacktest,
  hedgeComboBotFragment,
  keyValue,
  minigridSchema,
  notEnoughBalanceFragment,
  numericalBacktest,
  orders,
  payout,
  period,
  periodicStatsBacktest,
  ratiosBacktest,
  sharedSettings,
  shortExchangeFragment,
  statsFragment,
  statsSeries,
  symbolStatsBacktest,
  symbolsStatsFragment,
  usageBacktest,
  usdAsset,
  varsFragment,
};
