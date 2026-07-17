import type {
  BotTypesEnum,
  UserNotifications,
  UserState,
  SubscriptionPlans,
  SubscriptionType,
  Period,
  IndicatorEnum,
} from '../../types';
import type { ExchangeEnum } from '../../types/exchange.types';
import { IS_CLOUD } from '../../config/mode';
import { credits, period } from './GraphQLQueries-fragments';

type FavoriteIndicatorInput = { indicator: IndicatorEnum | string };

// `licenseKey` is exposed differently per backend:
//   • cloud/app  → `licenseKey: String`        (scalar, no subfields)
//   • sh/app-sh  → `licenseKey: LicenseKey`    (`{ key, isPremium }`)
// Asking for subfields against the cloud schema 400s, so build the
// selection per build mode. Consumers see a `string | { key, isPremium }`
// union; normalize at the call site if you need a shape.
const LICENSE_KEY_SELECTION = IS_CLOUD
  ? 'licenseKey'
  : `licenseKey {
                                  key
                                  isPremium
                                }`;

// `deletedAt` / `deletedScheduledAt` track pending account-delete
// requests. Cloud-only feature; app-sh doesn't expose either field, so
// requesting them would 400. Sh's build skips them.
const DELETED_ACCOUNT_SELECTION = IS_CLOUD
  ? `deletedAt
                                deletedScheduledAt`
  : '';

// Cloud-only credit balance. Used by the chat UI's agent-mode gate
// (hasAgentCredits). The legacy userSettings query omitted it, which
// drove `userCreditsFromSettings` to 0 — combined with `aiCreditsBalance`
// being null until the first socket credit-update, this hard-disabled
// Agent mode for any user who hadn't yet sent a paid chat message.
// Sh doesn't expose credits at all, so gate behind IS_CLOUD.
const CLOUD_CREDITS_SELECTION = IS_CLOUD
  ? `credits {
                                  ${credits}
                                }`
  : '';

// Per-user allowed login methods. Backed by the cloud `main-app` resolver;
// app-sh has no enforcement and doesn't expose the field, so gate behind
// IS_CLOUD to avoid a 400 on self-hosted.
const ALLOWED_LOGIN_METHODS_SELECTION = IS_CLOUD
  ? `allowedLoginMethods {
                                  password
                                  google
                                  emailLink
                                  passkey
                                }`
  : '';

// Cloud-only user fields. App-sh doesn't expose subscription, credits,
// balance, affiliate, notifications, rewards, tg, alerts, etc. — those
// belong to the paid SaaS layer. Requesting them on sh would 400, so
// keep the selection empty there.
const CLOUD_USER_FIELDS = IS_CLOUD
  ? `demo
                                nickname
                                lastChangeLog
                                balance
                                subscription {
                                  newSubscription
                                  credits {
                                    balance
                                    locked
                                  }
                                  subscriptionPlanName
                                  startDate
                                  automaticCharge
                                  status
                                  type
                                  price
                                  gateway
                                  paypalSubscriptionId
                                  nextPayment {
                                    subscriptionPlanName
                                    date
                                    type
                                  }
                                  charged
                                  extensions {
                                    type
                                    subscriptionPlanName
                                    date
                                    endDate
                                    price
                                  }
                                }
                                importAsPaper
                                switchPaperIcon
                                isEuRegion
                                affiliate {
                                  affiliateId
                                  totalBonuses
                                  freezeAmount
                                  affiliateLevel
                                  recentReferrals
                                  walletToWithdraw
                                  walletProtocol
                                  autoWithdraw
                                  affiliateValid
                                  referredPercent
                                }
                                notifications {
                                  profit
                                  payment
                                  subscription
                                  subscriptionExpiration
                                  affiliate
                                }
                                credits {
                                  ${credits}
                                }
                                discourseId
                                rewards {
                                  balance
                                  count
                                  new
                                }
                                tg {
                                  id
                                  username
                                }
                                alerts {
                                  type
                                  providers
                                }`
  : '';

export const userQueries = {
  getUserSubscriptionHistory: () => {
    const query = `query getUserSubscriptionHistory{
                        getUserSubscriptionHistory {
                            status
                            reason
                            data {
                              startDate
                              subscriptionPlanName
                              endOfSubscriptionDate
                              type
                              current
                              balance
                              amount
                              created
                            }
                        }
                  }`;
    return { query };
  },

  getUserPaymentHistory: () => {
    const query = `query getUserPaymentHistory{
                        getUserPaymentHistory {
                            status
                            reason
                            data {
                              amount
                              date
                              source
                              balance
                            }
                        }
                  }`;
    return { query };
  },

  isTrialAvailable: () => {
    const query = `query isTrialAvailable {
                        isTrialAvailable {
                            status
                            reason
                            data {
                              available
                              days
                            }
                        }
                  }`;
    return { query };
  },

  getSubscriptionPlanList: () => {
    const query = `query getSubscriptionPlanList {
                      getSubscriptionPlanList {
                        status
                        reason
                        data {
                            name
                            cost
                            yearlyCost
                            fullCost
                            fullYearlyCost
                            maxBots
                            maxLiveBots
                            maxPaperBots
                            maxGridComboBots
                            maxDCABots
                            maxPaperGridComboBots
                            maxPaperDCABots
                            credits
                            maxGainAiRequestsPerDay
                        }
                    }
                  }`;
    return { query };
  },
  getNewSubscriptionPlanList: () => {
    const query = `query getNewSubscriptionPlanList {
                      getNewSubscriptionPlanList {
                        status
                        reason
                        data {
                            name
                            price
                            fullPrice
                            yearlyPrice
                            fullYearlyPrice
                            subscriptionCredits
                            credits
                            maxGainAiRequestsPerDay
                            yearlyOnly
                            pricePerCredit
                            yearlyPricePerCredit
                        }
                    }
                  }`;
    return { query };
  },

  setUserNotifications: (input: UserNotifications) => {
    const query = `mutation setUserNotifications($input: userNotificationsInput!) {
      setUserNotifications(input: $input) {
        status
        reason
        data {
            profit
            payment
            subscription
            subscriptionExpiration
            affiliate
        }
      }
    }`;
    const variables = { input };
    return { query, variables };
  },

  setVideoUpdate: (input: NonNullable<UserState['videos']>[0]) => {
    const query = `mutation setVideoUpdate($input: setVideoUpdateInput!) {
      setVideoUpdate(input: $input) {
        status
        reason
        data
      }
    }`;
    const variables = { input };
    return { query, variables };
  },

  userFee: (input: { symbol: string; uuid: string }, fields?: string) => {
    const query = `query userFee($input: userFeeInput!) {
                        userFee(input: $input) {
                            status
                            reason
                            data {
                                ${
                                  fields ??
                                  `symbol
                                makerCommission
                                takerCommission`
                                }
                            }
                        }
                    }`;
    const variables = { input };
    return { query, variables };
  },

  token: (input: { username: string; password: string }) => {
    const query = `mutation token($input: tokenInput!) {
                        token(input: $input) {
                            status
                            reason
                            data {
                                token
                                isOTP
                                shouldOnBoard
                                shouldOnBoardExchange
                            }
                        }
                    }`;
    const variables = { input };
    return { query, variables };
  },

  getUserAffiliateHistory: () => {
    const query = `query getUserAffiliatesHistory {
                            getUserAffiliatesHistory {
                              status
                              reason
                              data {
                                  recentReferrals {
                                      creationDate
                                      status
                                      purchaseDate
                                      bonusTaken
                                      userEmail
                                      affiliateLink
                                  }
                                  statistic {
                                      clicks
                                      singups
                                      conversions
                                      income
                                      link
                                      referredPercent
                                  }
                                  recentTransactions {
                                      id
                                      concept
                                      date
                                      amount
                                      balance
                                      link
                                      txUrl
                                  }
                                  monthStatistic {
                                      date
                                      clicks
                                      signups
                                      conversions
                                      total
                                  }
                              }
                          }
                          }`;
    return { query };
  },

  userSettings: () => {
    const query = `query userSettings{
                        user {
                            status
                            reason
                            data {
                                _id
                                username
                                timezone
                                weekStart
                                name
                                lastName
                                picture
                                otp {
                                    otp_enabled
                                }
                                ${LICENSE_KEY_SELECTION}
                                ${DELETED_ACCOUNT_SELECTION}
                                ${CLOUD_CREDITS_SELECTION}
                                ${ALLOWED_LOGIN_METHODS_SELECTION}
                                shouldOnBoard
                                shouldOnBoardExchange
                                apiKeys {
                                    _id
                                    created
                                    expired
                                    permission
                                    name
                                    paperContext
                                    botId
                                    oauthClientId
                                }
                            }
                        }
                    }`;
    return { query };
  },

  user: () => {
    const query = `query user{
                        user {
                            status
                            reason
                            data {
                                _id
                                username
                                bigAccount
                                timezone
                                theme
                                weekStart
                                name
                                lastName
                                picture
                                hasExchanges
                                hasPaperExchanges
                                hasLiveExchanges
                                paperContext
                                videos {
                                  id
                                  watch80
                                  closed
                                }
                                onboardingSteps {
                                  signup
                                  liveExchange
                                  deployLiveBot
                                  earnProfit
                                }
                                groups
                                ${LICENSE_KEY_SELECTION}
                                ${DELETED_ACCOUNT_SELECTION}
                                ${CLOUD_USER_FIELDS}
                            }
                        }
                    }`;
    return { query };
  },

  setPercentForAffiliateForUser: (input: { referredPercent: number }) => {
    const query = `mutation setPercentForAffiliateForUser($input: setPercentForAffiliateForUserInput!)  {
                      setPercentForAffiliateForUser(input: $input) {
                        status
                        reason
                      }
                    }`;
    const variables = { input };
    return { query, variables };
  },

  getPortfolioByUser: (input?: {
    timezone?: string;
    from?: number;
    to?: number;
    includeAssets?: boolean;
  }) => {
    // The line only needs updateTime+totalUsd; per-day assets[] are only for the
    // coin/exchange filter. Omit them (includeAssets:false) for the common
    // all-coins/all-exchanges case so the payload stays small over a long range.
    const includeAssets = input?.includeAssets !== false;
    const assetsSelection = includeAssets
      ? `assets {
                                        name
                                        amount
                                        amountUsd
                                        exchanges {
                                          uuid
                                          amount
                                          amountUsd
                                        }
                                    }`
      : '';
    const query = `query getPortfolioByUser($input: getPortfolioByUser) {
                        getPortfolioByUser(input:$input){
                            status
                            reason
                            data{
                                result{
                                    updateTime
                                    totalUsd
                                    ${assetsSelection}
                                }
                            }
                        }
                    }`;
    const variables = { input };
    return { query, variables };
  },

  getProfitByUser: (
    input?: {
      timezone?: string;
      timeframe?: number;
      botType?: BotTypesEnum;
      terminal?: boolean;
    },
    fields?: string
  ) => {
    const query = `query getProfitByUser($input: getProfitByUser) {
                        getProfitByUser(input:$input){
                            status
                            reason
                            data{
                                result{
                                    ${
                                      fields ??
                                      `base
                                    quote
                                    date`
                                    }
                                }
                            }
                        }
                    }`;
    const variables = { input };
    return { query, variables };
  },

  setUserSettings: (input: {
    timezone?: string;
    theme?: string;
    paperContext?: boolean;
    shouldOnBoard?: boolean;
    shouldOnBoardExchange?: boolean;
    name?: string;
    lastName?: string;
    nickname?: string;
    adminRole?: boolean;
  }) => {
    const query = `mutation setUserSettings($input: userSettingsInput!) {
                        userSettings(input: $input) {
                            status
                            reason
                        }
                    }`;
    const variables = { input };
    return { query, variables };
  },

  // Cloud-only: per-user gate on allowed login methods. The backend
  // validates >=1 enabled + lockout safety and returns the saved set.
  setAllowedLoginMethods: (input: {
    password: boolean;
    google: boolean;
    emailLink: boolean;
    passkey: boolean;
  }) => {
    const query = `mutation setAllowedLoginMethods($input: allowedLoginMethodsInput!) {
                        setAllowedLoginMethods(input: $input) {
                            status
                            reason
                            data {
                                password
                                google
                                emailLink
                                passkey
                            }
                        }
                    }`;
    const variables = { input };
    return { query, variables };
  },

  getBalances: (
    input: {
      assets?: string[];
      uuid?: string;
      shouldSumBalance?: boolean;
      includeUsdValues?: boolean; // New optional parameter
    },
    fields?: string
  ) => {
    const defaultFields = `asset
         free
         locked
         exchange
         exchangeUUID
         exchangeName`;

    const query = `query getBalances($input: getBalancesInput!) {
                        getBalances(input: $input) {
                            status
                            reason
                            data {
                                ${fields ?? defaultFields}
                            }
                        }
                    }`;
    const variables = { input };
    return { query, variables };
  },

  // 2FA related queries
  generateOTP: () => {
    const query = `mutation generateOTP{ 
                    generateOTP {
                        status
                        reason
                        data {
                            otp_base32
                            otp_auth_url
                        }
                    }
                }`;
    return { query };
  },

  verifyOTP: (input: { otpToken: string }) => {
    const query = `mutation verifyOTP($input: verifyOTPInput!) { 
                    verifyOTP(input: $input) {
                        status
                        reason
                        data {
                            recoveryCodes
                        }
                    }
                }`;
    const variables = { input };
    return { query, variables };
  },

  disableOTP: () => {
    const query = `mutation disableOTP{ 
                    disableOTP {
                        status
                        reason
                    }
                }`;
    return { query };
  },

  // API Keys related queries
  createAPIKeys: () => {
    const query = `mutation createAPIKeys{ 
                    createAPIKeys {
                        status
                        reason
                        data {
                            _id
                            created
                            expired
                            permission
                            name
                            secret
                            paperContext
                            botId
                        }
                    }
                }`;
    return { query };
  },

  userAPIKeys: () => {
    const query = `query userAPIKeys{ 
                        user {
                            status
                            reason
                            data {
                                apiKeys {
                                    _id
                                    created
                                    expired
                                    permission
                                    name
                                    paperContext
                                    botId
                                    oauthClientId
                                }
                            }
                        }
                    }`;
    return { query };
  },

  renewAPIKeys: (input: { key: string }) => {
    const query = `mutation renewAPIKeys($input: apiKeysInput!) { 
                    renewAPIKeys(input: $input) {
                        status
                        reason
                        data {
                            _id
                            created
                            expired
                            permission
                            name
                            paperContext
                            botId
                        }
                    }
                }`;
    const variables = { input };
    return { query, variables };
  },

  changeAPIKeysPermission: (input: { key: string; permission: string }) => {
    const query = `mutation changeAPIKeysPermission($input: changeAPIKeysPermissionInput!) { 
                    changeAPIKeysPermission(input: $input) {
                        status
                        reason
                        data {
                            _id
                            created
                            expired
                            permission
                            name
                            paperContext
                            botId
                        }
                    }
                }`;
    const variables = { input };
    return { query, variables };
  },

  changeAPIKeysName: (input: { key: string; name: string }) => {
    const query = `mutation changeAPIKeysName($input: changeAPIKeysNameInput!) { 
                    changeAPIKeysName(input: $input) {
                        status
                        reason
                        data {
                            _id
                            created
                            expired
                            permission
                            name
                            paperContext
                            botId
                        }
                    }
                }`;
    const variables = { input };
    return { query, variables };
  },

  deleteAPIKeys: (input: { key: string }) => {
    const query = `mutation deleteAPIKeys($input: apiKeysInput!) { 
                    deleteAPIKeys(input: $input) {
                        status
                        reason
                        data {
                            created
                            expired
                            permission
                            _id
                        }
                    }
                }`;
    const variables = { input };
    return { query, variables };
  },

  // Password and timezone queries
  changePassword: (input: { password: string }) => {
    const query = `mutation changePassword($input: changePasswordInput!) { 
                    changePassword(input: $input) {
                        status
                        reason
                        data 
                    }
                }`;
    const variables = { input };
    return { query, variables };
  },

  setTimezone: (input: { timezone: string; weekStart: string }) => {
    const query = `mutation setTimezone($input: setTimezoneInput!) { 
                    setTimezone(input: $input) {
                        status
                        reason
                    }
                }`;
    const variables = { input };
    return { query, variables };
  },

  // License key query
  generateLicenseKey: () => {
    const query = `mutation generateLicenseKey{
                    generateLicenseKey {
                        status
                        reason
                        data
                    }
                }`;
    return { query };
  },

  /**
   * Save a user-supplied license key. Used in self-hosted builds where
   * the user generates a key on gainium.io and pastes it here. Cloud
   * doesn't need this — cloud generates its own via
   * `generateLicenseKey`.
   */
  setLicenseKey: (input: { key: string }) => {
    const query = `mutation setLicenseKey($input: setLicenseKeyInput!) {
                    setLicenseKey(input: $input) {
                        status
                        reason
                        data
                    }
                }`;
    const variables = { input };
    return { query, variables };
  },

  /** Clear the user's stored license key. */
  deleteLicenseKey: () => {
    const query = `mutation deleteLicenseKey {
                    deleteLicenseKey {
                        status
                        reason
                        data
                    }
                }`;
    return { query };
  },

  // ===== AUTO-ADDED MISSING FUNCTIONS =====
  // Added by API Enhancer - DO NOT EDIT MANUALLY

  multipleUserFees: (
    input: { symbol: string[]; uuid: string },
    fields?: string
  ) => {
    const query = `query multipleUserFees($input: multipleUserFeesInput!) {
  multipleUserFees(input: $input) {
  status
  reason
  data {
  ${
    fields ??
    `symbol
  maker
  taker`
  }
  }
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  readPlatformNotificationByUser: (input: {
    notificationId?: number;
    isRead?: boolean;
  }) => {
    const query = `mutation readPlatformNotificationByUser($input: readPlatformNotificationByUserInput!) {
  readPlatformNotificationByUser(input: $input) {
  status
  reason
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  updateUserSubscriptionPlan: (input: {
    newSubscriptionPlanName: SubscriptionPlans;
    type: SubscriptionType;
    extend?: boolean;
    extendCount?: number;
  }) => {
    const query = `mutation updateUserSubscriptionPlan($input: newUserSubscriptionInput!) {
  updateUserSubscriptionPlan(input: $input) {
  status
  reason
  data {
  updatedUser {
  balance
  subscription {
  subscriptionPlanName
  automaticCharge
  startDate
  type
  nextPayment {
  subscriptionPlanName
  date
  type
  }
  extensions {
  type
  subscriptionPlanName
  date
  endDate
  price
  }
  }
  }
  }
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  setUserNextSubscriptionPlan: (input: {
    newSubscriptionPlanName: SubscriptionPlans;
    type: SubscriptionType;
  }) => {
    const query = `mutation setUserNextSubscriptionPlan($input: newUserSubscriptionInput!) {
  setUserNextSubscriptionPlan(input: $input) {
  status
  reason
  data {
  updatedUser {
  balance
  subscription {
  subscriptionPlanName
  automaticCharge
  startDate
  type
  nextPayment {
  subscriptionPlanName
  date
  type
  }
  extensions {
  type
  subscriptionPlanName
  date
  endDate
  price
  }
  }
  }
  }
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  addUserFavoritePair: (input: { pair: string; provider: ExchangeEnum }) => {
    const query = `mutation addUserFavoritePair($input: favoritePairInput!) { 
  addUserFavoritePair(input: $input) {
  status
  reason
  data {
  provider
  pairs
  }
  }
  }`;

    const variables = { input };
    return { query, variables };
  },

  removeUserFavoritePair: (input: { pair: string; provider: ExchangeEnum }) => {
    const query = `mutation removeUserFavoritePair($input: favoritePairInput!) { 
  removeUserFavoritePair(input: $input) {
  status
  reason
  data {
  provider
  pairs
  }
  }
  }`;

    const variables = { input };
    return { query, variables };
  },

  saveUserPeriod: (input: Omit<Period, '_id'>) => {
    const query = `mutation saveUserPeriod($input: userPeriodInput!) {
  saveUserPeriod(input: $input) {
  status
  reason
  data {
  ${period}
  }
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  updateUserPeriod: (input: Period) => {
    const query = `mutation updateUserPeriod($input: updatePeriodInput!) {
  updateUserPeriod(input: $input) {
  status
  reason
  data {
  ${period}
  }
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  deleteUserPeriod: (input: { uuid: string }) => {
    const query = `mutation deleteUserPeriod($input: deletePeriodInput!) {
  deleteUserPeriod(input: $input) {
  status
  reason
  data {
  ${period}
  }
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  removeUserFiles: (input: { files: string[] }) => {
    const query = `mutation removeUserFiles($input:removeUserFilesInput!) { 
  removeUserFiles(input: $input) {
  status
  reason
  data 
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  getUserFavoriteIndicators: () => {
    const query = `query getUserFavoriteIndicators{
  getUserFavoriteIndicators {
  status
  reason
  data {
  indicators
  }
  }
  }`;
    return { query };
  },

  addUserFavoriteIndicator: (input: FavoriteIndicatorInput) => {
    const query = `mutation addUserFavoriteIndicator($input: favoriteIndicatorInput!) {
  addUserFavoriteIndicator(input: $input) {
  status
  reason
  data {
  indicators
  } 
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  removeUserFavoriteIndicator: (input: FavoriteIndicatorInput) => {
    const query = `mutation removeUserFavoriteIndicator($input: favoriteIndicatorInput!) {
  removeUserFavoriteIndicator(input: $input) {
  status
  reason
  data {
  indicators
  }
  }
  }`;
    const variables = { input };
    return { query, variables };
  },

  // ===== Magic link =====
  requestMagicLink: (input: { email: string; redirectPath?: string }) => {
    const query = `mutation requestMagicLink($input: requestMagicLinkInput!) {
                    requestMagicLink(input: $input) {
                        status
                        reason
                    }
                }`;
    const variables = { input };
    return { query, variables };
  },

  consumeMagicLink: (input: {
    token: string;
    timezone?: string;
    termsAccepted?: boolean;
  }) => {
    const query = `mutation consumeMagicLink($input: consumeMagicLinkInput!) {
                    consumeMagicLink(input: $input) {
                        status
                        reason
                        data {
                            token
                            isNewUser
                            pendingTerms
                            email
                        }
                    }
                }`;
    const variables = { input };
    return { query, variables };
  },

  // ===== Password reset =====
  requestPasswordReset: (input: { email: string }) => {
    const query = `mutation requestPasswordReset($input: requestPasswordResetInput!) {
                    requestPasswordReset(input: $input) {
                        status
                        reason
                    }
                }`;
    const variables = { input };
    return { query, variables };
  },

  resetPassword: (input: { token: string; newPassword: string }) => {
    const query = `mutation resetPassword($input: resetPasswordInput!) {
                    resetPassword(input: $input) {
                        status
                        reason
                        data {
                            token
                        }
                    }
                }`;
    const variables = { input };
    return { query, variables };
  },

  // ===== WebAuthn / Passkeys =====
  webauthnRegistrationOptions: () => {
    const query = `mutation webauthnRegistrationOptions {
                    webauthnRegistrationOptions {
                        status
                        reason
                        data {
                            options
                        }
                    }
                }`;
    return { query };
  },

  webauthnVerifyRegistration: (input: { response: unknown; label?: string }) => {
    const query = `mutation webauthnVerifyRegistration($input: WebauthnVerifyRegInput!) {
                    webauthnVerifyRegistration(input: $input) {
                        status
                        reason
                        data {
                            credentialId
                            label
                            deviceType
                            backedUp
                            transports
                        }
                    }
                }`;
    const variables = { input };
    return { query, variables };
  },

  webauthnAuthenticationOptions: (input: { email?: string }) => {
    const query = `mutation webauthnAuthenticationOptions($input: webauthnAuthOptionsInput!) {
                    webauthnAuthenticationOptions(input: $input) {
                        status
                        reason
                        data {
                            options
                        }
                    }
                }`;
    const variables = { input };
    return { query, variables };
  },

  webauthnVerifyAuthentication: (input: { response: unknown }) => {
    const query = `mutation webauthnVerifyAuthentication($input: WebauthnVerifyAuthInput!) {
                    webauthnVerifyAuthentication(input: $input) {
                        status
                        reason
                        data {
                            token
                        }
                    }
                }`;
    const variables = { input };
    return { query, variables };
  },

  webauthnRevokeCredential: (input: { credentialId: string }) => {
    const query = `mutation webauthnRevokeCredential($input: revokeCredentialInput!) {
                    webauthnRevokeCredential(input: $input) {
                        status
                        reason
                    }
                }`;
    const variables = { input };
    return { query, variables };
  },

  webauthnRenameCredential: (input: { credentialId: string; label: string }) => {
    const query = `mutation webauthnRenameCredential($input: renameCredentialInput!) {
                    webauthnRenameCredential(input: $input) {
                        status
                        reason
                    }
                }`;
    const variables = { input };
    return { query, variables };
  },

  webauthnCredentials: () => {
    const query = `query webauthnCredentials {
                    webauthnCredentials {
                        status
                        reason
                        data {
                            credentialId
                            label
                            deviceType
                            transports
                            createdAt
                            lastUsedAt
                        }
                    }
                }`;
    return { query };
  },

  // ===== Recovery codes regenerate (existing 2FA flow) =====
  regenerateRecoveryCodes: (input: { otpToken: string }) => {
    const query = `mutation regenerateRecoveryCodes($input: regenerateRecoveryCodesInput!) {
                    regenerateRecoveryCodes(input: $input) {
                        status
                        reason
                        data {
                            recoveryCodes
                        }
                    }
                }`;
    const variables = { input };
    return { query, variables };
  },

  // ===== Active sessions (device / login session management) =====
  // Admin-impersonation sessions are filtered out server-side, so they
  // never appear in this list.
  activeSessions: () => {
    const query = `query activeSessions {
                    activeSessions {
                        status
                        reason
                        data {
                            id
                            source
                            device
                            ip
                            location
                            createdAt
                            expiredAt
                            current
                        }
                    }
                }`;
    return { query };
  },
  revokeSession: (input: { id: string }) => {
    const query = `mutation revokeSession($input: revokeSessionInput!) {
                    revokeSession(input: $input) {
                        status
                        reason
                    }
                }`;
    const variables = { input };
    return { query, variables };
  },
  logoutOtherSessions: () => {
    const query = `mutation logoutOtherSessions {
                    logoutOtherSessions {
                        status
                        reason
                    }
                }`;
    return { query };
  },
};
