const mongoose = require('mongoose');
const { BusinessCapability } = require('../models/ReferenceData');

const capabilities = [
  // ══════ Operations – Customer Domain ══════
  { name: 'Marketing & Offer Management', domainName: 'Operations – Customer Domain', aspect: 'Operations', briefDescription: 'Manages marketing campaigns, product offers, promotions, and customer-facing propositions across all channels.', tmfVersion: 'GB1029C' },
  { name: 'Selling', domainName: 'Operations – Customer Domain', aspect: 'Operations', briefDescription: 'Handles direct and indirect sales activities, lead management, opportunity tracking, and sales channel coordination.', tmfVersion: 'GB1029C' },
  { name: 'Order Handling', domainName: 'Operations – Customer Domain', aspect: 'Operations', briefDescription: 'Manages the end-to-end lifecycle of customer orders from capture through fulfilment, tracking, and completion.', tmfVersion: 'GB1029C' },
  { name: 'Problem Handling', domainName: 'Operations – Customer Domain', aspect: 'Operations', briefDescription: 'Manages customer-reported problems and complaints through resolution, including escalation and root cause analysis.', tmfVersion: 'GB1029C' },
  { name: 'Customer QoS/SLA Management', domainName: 'Operations – Customer Domain', aspect: 'Operations', briefDescription: 'Monitors and manages quality of service levels and service level agreements to meet customer expectations.', tmfVersion: 'GB1029C' },
  { name: 'Billing & Revenue Management', domainName: 'Operations – Customer Domain', aspect: 'Operations', briefDescription: 'Produces accurate bills, manages accounts receivable, invoicing, and revenue collection processes.', tmfVersion: 'GB1029C' },
  { name: 'Retention & Loyalty', domainName: 'Operations – Customer Domain', aspect: 'Operations', briefDescription: 'Manages customer retention programs, loyalty schemes, and churn prevention activities.', tmfVersion: 'GB1029C' },
  { name: 'Customer Management', domainName: 'Operations – Customer Domain', aspect: 'Operations', briefDescription: 'Maintains customer records, profiles, preferences, and manages the overall customer relationship lifecycle.', tmfVersion: 'GB1029C' },

  // ══════ Operations – Service Domain ══════
  { name: 'Service Configuration & Activation', domainName: 'Operations – Service Domain', aspect: 'Operations', briefDescription: 'Configures and activates services on the network according to customer orders and service specifications.', tmfVersion: 'GB1029C' },
  { name: 'Service Problem Management', domainName: 'Operations – Service Domain', aspect: 'Operations', briefDescription: 'Detects, diagnoses, and resolves service-affecting issues to restore normal service operation.', tmfVersion: 'GB1029C' },
  { name: 'Service Quality Management', domainName: 'Operations – Service Domain', aspect: 'Operations', briefDescription: 'Monitors and manages service quality parameters to ensure services meet defined performance standards.', tmfVersion: 'GB1029C' },
  { name: 'Service & Specific Instance Rating', domainName: 'Operations – Service Domain', aspect: 'Operations', briefDescription: 'Rates service usage events and applies pricing rules to generate billable charges.', tmfVersion: 'GB1029C' },

  // ══════ Operations – Resource Domain ══════
  { name: 'Resource Provisioning', domainName: 'Operations – Resource Domain', aspect: 'Operations', briefDescription: 'Allocates, configures, and installs network and IT resources required to deliver services.', tmfVersion: 'GB1029C' },
  { name: 'Resource Trouble Management', domainName: 'Operations – Resource Domain', aspect: 'Operations', briefDescription: 'Manages faults and failures in network and IT resources through detection, isolation, and repair.', tmfVersion: 'GB1029C' },
  { name: 'Resource Performance Management', domainName: 'Operations – Resource Domain', aspect: 'Operations', briefDescription: 'Monitors resource performance metrics, identifies degradation, and triggers corrective actions.', tmfVersion: 'GB1029C' },
  { name: 'Resource Data Collection & Processing', domainName: 'Operations – Resource Domain', aspect: 'Operations', briefDescription: 'Collects, normalizes, and processes raw data from network elements and IT resources.', tmfVersion: 'GB1029C' },

  // ══════ Operations – Supplier/Partner Domain ══════
  { name: 'S/P Requisition Management', domainName: 'Operations – Supplier/Partner Domain', aspect: 'Operations', briefDescription: 'Manages requisitions and purchase orders with suppliers and partners for goods and services.', tmfVersion: 'GB1029C' },
  { name: 'S/P Problem Reporting & Management', domainName: 'Operations – Supplier/Partner Domain', aspect: 'Operations', briefDescription: 'Reports and manages problems with supplier/partner-delivered services and tracks resolution.', tmfVersion: 'GB1029C' },
  { name: 'S/P Performance Management', domainName: 'Operations – Supplier/Partner Domain', aspect: 'Operations', briefDescription: 'Monitors and evaluates supplier/partner performance against agreed service levels and KPIs.', tmfVersion: 'GB1029C' },
  { name: 'S/P Settlements & Payments Management', domainName: 'Operations – Supplier/Partner Domain', aspect: 'Operations', briefDescription: 'Manages financial settlements, payments, and reconciliation with suppliers and partners.', tmfVersion: 'GB1029C' },

  // ══════ Strategy & Commit ══════
  { name: 'Market Strategy & Policy', domainName: 'Strategy & Commit', aspect: 'Strategy', briefDescription: 'Defines market positioning, competitive strategy, and high-level business policies for market engagement.', tmfVersion: 'GB1029C' },
  { name: 'Product & Offer Portfolio Planning', domainName: 'Strategy & Commit', aspect: 'Strategy', briefDescription: 'Plans the product and offer portfolio, including lifecycle roadmaps and market fit analysis.', tmfVersion: 'GB1029C' },
  { name: 'Service Strategy & Planning', domainName: 'Strategy & Commit', aspect: 'Strategy', briefDescription: 'Defines strategic direction for service development, innovation, and technology adoption.', tmfVersion: 'GB1029C' },
  { name: 'Resource Strategy & Planning', domainName: 'Strategy & Commit', aspect: 'Strategy', briefDescription: 'Plans resource capacity, technology evolution, and infrastructure investment strategy.', tmfVersion: 'GB1029C' },
  { name: 'Supply Chain Strategy & Planning', domainName: 'Strategy & Commit', aspect: 'Strategy', briefDescription: 'Defines strategy for supply chain optimization, sourcing, and partner ecosystem development.', tmfVersion: 'GB1029C' },
  { name: 'Customer Strategy & Policy', domainName: 'Strategy & Commit', aspect: 'Strategy', briefDescription: 'Defines customer segmentation strategy, engagement policies, and experience design principles.', tmfVersion: 'GB1029C' },

  // ══════ Infrastructure Lifecycle Management ══════
  { name: 'Product & Offer Capability Delivery', domainName: 'Infrastructure Lifecycle Management', aspect: 'Infrastructure', briefDescription: 'Delivers and operationalizes new product/offer capabilities including systems and processes.', tmfVersion: 'GB1029C' },
  { name: 'Service Capability Delivery', domainName: 'Infrastructure Lifecycle Management', aspect: 'Infrastructure', briefDescription: 'Delivers service infrastructure capabilities required to support new or changed services.', tmfVersion: 'GB1029C' },
  { name: 'Resource Capability Delivery', domainName: 'Infrastructure Lifecycle Management', aspect: 'Infrastructure', briefDescription: 'Delivers network and IT resource capabilities through deployment, integration, and commissioning.', tmfVersion: 'GB1029C' },
  { name: 'Supply Chain Capability Delivery', domainName: 'Infrastructure Lifecycle Management', aspect: 'Infrastructure', briefDescription: 'Establishes and deploys supply chain capabilities including logistics and partner integrations.', tmfVersion: 'GB1029C' },

  // ══════ Product Lifecycle Management ══════
  { name: 'Product & Offer Development & Retirement', domainName: 'Product Lifecycle Management', aspect: 'Product', briefDescription: 'Manages the full lifecycle of products and offers from concept through development to retirement.', tmfVersion: 'GB1029C' },
  { name: 'Service Development & Retirement', domainName: 'Product Lifecycle Management', aspect: 'Product', briefDescription: 'Develops new services and retires obsolete ones through structured lifecycle management.', tmfVersion: 'GB1029C' },
  { name: 'Resource Development & Retirement', domainName: 'Product Lifecycle Management', aspect: 'Product', briefDescription: 'Manages the lifecycle of network/IT resources from introduction through decommissioning.', tmfVersion: 'GB1029C' },
  { name: 'Supply Chain Development & Change Management', domainName: 'Product Lifecycle Management', aspect: 'Product', briefDescription: 'Develops and evolves supply chain processes, onboards new suppliers, and manages changes.', tmfVersion: 'GB1029C' },

  // ══════ Enterprise Management ══════
  { name: 'Strategic & Enterprise Planning', domainName: 'Enterprise Management', aspect: 'Enterprise', briefDescription: 'Provides overall enterprise strategic planning, business architecture, and transformation roadmaps.', tmfVersion: 'GB1029C' },
  { name: 'Enterprise Risk Management', domainName: 'Enterprise Management', aspect: 'Enterprise', briefDescription: 'Identifies, assesses, and mitigates business risks across the enterprise including compliance.', tmfVersion: 'GB1029C' },
  { name: 'Enterprise Effectiveness Management', domainName: 'Enterprise Management', aspect: 'Enterprise', briefDescription: 'Manages organizational effectiveness, process improvement, and operational efficiency programs.', tmfVersion: 'GB1029C' },
  { name: 'Knowledge & Research Management', domainName: 'Enterprise Management', aspect: 'Enterprise', briefDescription: 'Manages intellectual assets, research activities, and organizational knowledge sharing.', tmfVersion: 'GB1029C' },
  { name: 'Financial & Asset Management', domainName: 'Enterprise Management', aspect: 'Enterprise', briefDescription: 'Manages corporate finances, budgets, accounting, and physical/logical asset tracking.', tmfVersion: 'GB1029C' },
  { name: 'Stakeholder & External Relations Management', domainName: 'Enterprise Management', aspect: 'Enterprise', briefDescription: 'Manages relationships with regulators, investors, media, and external stakeholders.', tmfVersion: 'GB1029C' },
  { name: 'Human Resources Management', domainName: 'Enterprise Management', aspect: 'Enterprise', briefDescription: 'Manages employee lifecycle including recruitment, development, compensation, and retention.', tmfVersion: 'GB1029C' },
  { name: 'Fraud Management', domainName: 'Enterprise Management', aspect: 'Enterprise', briefDescription: 'Detects, prevents, and investigates fraudulent activities across services and operations.', tmfVersion: 'GB1029C' },
  { name: 'Revenue Assurance', domainName: 'Enterprise Management', aspect: 'Enterprise', briefDescription: 'Ensures revenue integrity by detecting and correcting revenue leakage across the value chain.', tmfVersion: 'GB1029C' },
  { name: 'Security Management', domainName: 'Enterprise Management', aspect: 'Enterprise', briefDescription: 'Manages information security, cyber defense, access control, and security incident response.', tmfVersion: 'GB1029C' },
  { name: 'Insurance Management', domainName: 'Enterprise Management', aspect: 'Enterprise', briefDescription: 'Manages enterprise insurance policies, claims, and risk transfer mechanisms.', tmfVersion: 'GB1029C' },
  { name: 'Procurement Management', domainName: 'Enterprise Management', aspect: 'Enterprise', briefDescription: 'Manages strategic sourcing, vendor selection, contract negotiation, and purchasing processes.', tmfVersion: 'GB1029C' },
  { name: 'IT Planning & Architecture', domainName: 'Enterprise Management', aspect: 'Enterprise', briefDescription: 'Plans IT strategy, enterprise architecture, technology standards, and digital transformation.', tmfVersion: 'GB1029C' },
  { name: 'IT Operations Support', domainName: 'Enterprise Management', aspect: 'Enterprise', briefDescription: 'Provides IT service management, infrastructure operations, and technical support.', tmfVersion: 'GB1029C' },
  { name: 'Application Development & Maintenance', domainName: 'Enterprise Management', aspect: 'Enterprise', briefDescription: 'Develops, tests, deploys, and maintains software applications supporting business processes.', tmfVersion: 'GB1029C' },
  { name: 'Workforce Management', domainName: 'Enterprise Management', aspect: 'Enterprise', briefDescription: 'Plans and optimizes workforce scheduling, dispatch, and field operations activities.', tmfVersion: 'GB1029C' },
  { name: 'Party Management', domainName: 'Enterprise Management', aspect: 'Enterprise', briefDescription: 'Manages all party types (individuals, organizations) and their roles within the enterprise ecosystem.', tmfVersion: 'GB1029C' },
  { name: 'Agreement Management', domainName: 'Enterprise Management', aspect: 'Enterprise', briefDescription: 'Manages contracts, agreements, and legal instruments across customer, partner, and supplier relationships.', tmfVersion: 'GB1029C' },
  { name: 'Usage Management', domainName: 'Operations – Service Domain', aspect: 'Operations', briefDescription: 'Collects, mediates, and processes usage records for rating, billing, and analytics.', tmfVersion: 'GB1029C' },
  { name: 'Loyalty Management', domainName: 'Operations – Customer Domain', aspect: 'Operations', briefDescription: 'Administers loyalty programs, reward points, tiers, and redemption mechanics.', tmfVersion: 'GB1029C' },
  { name: 'Debt Collection', domainName: 'Operations – Customer Domain', aspect: 'Operations', briefDescription: 'Manages outstanding debt recovery through dunning processes and collection actions.', tmfVersion: 'GB1029C' },
  { name: 'Bill Inquiry Handling', domainName: 'Operations – Customer Domain', aspect: 'Operations', briefDescription: 'Handles customer billing inquiries, disputes, and adjustments to resolve billing issues.', tmfVersion: 'GB1029C' },
  { name: 'Bill Payments & Receivables Management', domainName: 'Operations – Customer Domain', aspect: 'Operations', briefDescription: 'Processes bill payments, manages receivables, and handles payment allocation and reconciliation.', tmfVersion: 'GB1029C' },
  { name: 'Charging', domainName: 'Operations – Service Domain', aspect: 'Operations', briefDescription: 'Applies real-time and batch charging for service usage based on pricing plans and policies.', tmfVersion: 'GB1029C' },
  { name: 'Manage Billing Events', domainName: 'Operations – Customer Domain', aspect: 'Operations', briefDescription: 'Manages the lifecycle of billing events from creation through rating to bill production.', tmfVersion: 'GB1029C' },
  { name: 'Party Interaction Management', domainName: 'Operations – Customer Domain', aspect: 'Operations', briefDescription: 'Manages all interactions with parties across touchpoints, recording context and outcomes.', tmfVersion: 'GB1029C' },
  { name: 'Channel Management', domainName: 'Operations – Customer Domain', aspect: 'Operations', briefDescription: 'Manages sales and service delivery channels including digital, retail, and partner channels.', tmfVersion: 'GB1029C' },
];

async function seed() {
  await mongoose.connect('mongodb://127.0.0.1:27017/bpmn_iq');

  let updated = 0;
  let created = 0;
  let errors = 0;

  for (const cap of capabilities) {
    try {
      const result = await BusinessCapability.findOneAndUpdate(
        { name: cap.name },
        { $set: cap },
        { upsert: true, new: true }
      );
      if (result.createdAt && result.updatedAt && result.createdAt.getTime() === result.updatedAt.getTime()) {
        created++;
      } else {
        updated++;
      }
    } catch (e) {
      console.error('Error:', cap.name, e.message);
      errors++;
    }
  }

  const total = await BusinessCapability.countDocuments();
  console.log(`Done. Updated: ${updated} | Created: ${created} | Errors: ${errors} | Total: ${total}`);
  await mongoose.disconnect();
}

seed();
