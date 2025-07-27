# Phase 1 Prompt: Business Requirements Analysis

I'm starting Phase 1 of the BMAD-Actor framework to analyze your business requirements and identify the optimal actor architecture.

## Current Phase: Business Requirements Analysis
**Goal**: Decompose your project into well-defined actors with clear boundaries and responsibilities.

## What I Need From You:
1. **Project Description**: What are you building? (2-3 sentences)
2. **Target Users**: Who will use this system? (customers, admins, etc.)
3. **Core Features**: What are the main capabilities needed?
4. **Success Metrics**: How will you measure success?

## What I'll Deliver:
1. **Actor Identification**: List of business domains that become actors
2. **Boundary Analysis**: Clear data ownership and responsibility for each actor
3. **User Journey Mapping**: How user actions flow through actors
4. **Component Planning**: UI components each actor will export
5. **Validation Report**: Confirmation each actor passes responsibility tests

## Actor Responsibility Tests I Apply:
- [ ] Owns distinct business domain and data
- [ ] Has business rules that change independently  
- [ ] Needs to scale separately from other components
- [ ] Represents cohesive business capability
- [ ] Would make sense as a microservice
- [ ] Can be developed by 2-3 person team

## Example Output Format:
```yaml
project_analysis:
  domain: "E-commerce Platform"
  actors:
    - name: "user"
      purpose: "Manages user authentication and profiles"
      data_owned: ["profiles", "sessions", "preferences"]
      business_rules: ["unique email", "password requirements"]
    - name: "product" 
      purpose: "Manages product catalog and inventory"
      data_owned: ["products", "categories", "stock levels"]
      business_rules: ["stock validation", "pricing rules"]
```

**Ready to proceed? Please provide your project requirements.**