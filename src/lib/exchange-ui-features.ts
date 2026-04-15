/**
 * Server-authored UI feature flags on `exchange.variables.features`.
 * Short keys keep payloads small for the interaction app.
 */
export function variablesFeaturesFromConfig(
  config: App.Config
): NonNullable<App.BaseVariables['features']> {
  return { details: config.uiShowDetails }
}
