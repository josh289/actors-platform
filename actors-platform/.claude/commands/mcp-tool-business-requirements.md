# MCP Tool: analyze_business_requirements

## Purpose
Analyze project requirements and decompose into well-defined actors using BMAD domain analysis principles.

## Input Schema
```json
{
  "project_description": "string - 2-3 sentence description of what you're building",
  "target_users": "array - list of user types (customers, admins, etc.)",
  "core_features": "array - main capabilities needed",
  "success_metrics": "array - how success will be measured",
  "constraints": {
    "budget": "string - budget constraints if any",
    "timeline": "string - delivery timeline",
    "team_size": "number - development team size"
  }
}
```

## Processing Logic
1. **Domain Identification**: Extract distinct business domains from requirements
2. **Actor Responsibility Test**: Apply 6-point validation for each potential actor
3. **Boundary Analysis**: Ensure clear data ownership and minimal coupling
4. **User Journey Mapping**: Map user actions to actor events
5. **Validation**: Confirm each actor passes all responsibility tests

## Output Schema
```yaml
project_analysis:
  domain: string
  success_metrics: array
  actors:
    - name: string
      domain: string
      purpose: string
      data_owned: array
      business_rules: array
      user_journeys: array
      complexity_score: number
      dependencies: array
```