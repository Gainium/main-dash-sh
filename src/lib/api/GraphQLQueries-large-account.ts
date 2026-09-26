/**
 * Large-account mode queries. Each lives in its OWN document: an older
 * (self-hosted) backend without these fields rejects the whole document, and
 * the caller must be able to treat that as "mode off" without losing any
 * other query.
 */
export const largeAccountQueries = {
  largeAccount: () => ({
    query: `query largeAccount {
      largeAccount {
        status
        reason
        data {
          active
          source
          reason
          override
          overrideBy
          canUserEnable
          canUserRevert
          paperContext
          computedAt
          counts { activeBots openDeals terminalBots }
          thresholds {
            activeBots { enter leave }
            openDeals { enter leave }
            terminalBots { enter leave }
          }
        }
      }
    }`,
    variables: {},
  }),

  setLargeAccountMode: (mode: 'on' | 'auto') => ({
    query: `mutation setLargeAccountMode($input: setLargeAccountModeInput!) {
      setLargeAccountMode(input: $input) {
        status
        reason
        data { active override overrideBy canUserEnable }
      }
    }`,
    variables: { input: { mode } },
  }),
};
