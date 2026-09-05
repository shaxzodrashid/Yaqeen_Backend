import { AgentDeduplicationEngine } from '../../scripts/agent-deduplication.engine';

describe('AgentDeduplicationEngine', () => {
  let engine: AgentDeduplicationEngine;

  beforeEach(() => {
    engine = new AgentDeduplicationEngine();
  });

  describe('User Prompt Core Requirement: "Tie Tie" variations', () => {
    it('should identify "Tie Tie", "TieTie", "Tie tie", "tieTie", "tietie" as the exact same agent', () => {
      const variations = ['Tie Tie', 'TieTie', 'Tie tie', 'tieTie', 'tietie'];

      for (let i = 0; i < variations.length; i++) {
        for (let j = 0; j < variations.length; j++) {
          const result = engine.areSameAgent(variations[i], variations[j]);
          expect(result.match).toBe(true);
        }
      }
    });

    it('should cluster all "Tie Tie" variations into a single canonical agent', () => {
      const records = [
        { name: 'Tie Tie', count: 12 },
        { name: 'TieTie', count: 5 },
        { name: 'Tie tie', count: 3 },
        { name: 'tieTie', count: 2 },
        { name: 'tietie', count: 1 },
      ];

      const clusters = engine.clusterAgentRecords(records);
      expect(clusters.length).toBe(1);

      const agent = clusters[0];
      expect(agent.canonicalName).toBe('Tie Tie');
      expect(agent.first_name).toBe('Tie');
      expect(agent.last_name).toBe('Tie');
      expect(agent.totalCargos).toBe(23);
      expect(agent.variations.length).toBe(5);
    });

    it('should also recognize punctuated forms like "Tie-Tie" and "Tie_Tie"', () => {
      expect(engine.areSameAgent('Tie-Tie', 'Tie Tie').match).toBe(true);
      expect(engine.areSameAgent('Tie_Tie', 'TieTie').match).toBe(true);
      expect(engine.areSameAgent('Tie.Tie', 'tietie').match).toBe(true);
    });

    it('should match Cyrillic transliterated "Тие Тие" to "Tie Tie"', () => {
      expect(engine.areSameAgent('Тие Тие', 'Tie Tie').match).toBe(true);
    });
  });

  describe('Company and Entity Clustering', () => {
    it('should cluster "Silk Road", "SilkRoad", and "Silk-Road" together', () => {
      const records = [
        { name: 'Silk Road', count: 10 },
        { name: 'SilkRoad', count: 4 },
        { name: 'silk-road', count: 2 },
      ];

      const clusters = engine.clusterAgentRecords(records);
      expect(clusters.length).toBe(1);
      expect(clusters[0].canonicalName).toBe('Silk Road');
    });

    it('should properly extract company names when corporate keywords are present', () => {
      const records = [
        { name: 'Silk Road Logistics LLC', count: 8 },
        { name: 'Silk Road Logistics', count: 4 },
      ];

      const clusters = engine.clusterAgentRecords(records);
      expect(clusters.length).toBe(1);
      expect(clusters[0].company_name).toBe('Silk Road Logistics LLC');
      expect(clusters[0].first_name).toBeNull();
      expect(clusters[0].last_name).toBeNull();
    });

    it('should handle parenthesized company in name: "Alex (Silk Road)"', () => {
      const fields = engine.extractAgentFields('Alex (Silk Road)', []);
      expect(fields.first_name).toBe('Alex');
      expect(fields.last_name).toBeNull();
      expect(fields.company_name).toBe('Silk Road');
    });

    it('should keep different agents in distinct clusters', () => {
      const records = [
        { name: 'Tie Tie', count: 5 },
        { name: 'Silk Road', count: 5 },
        { name: 'Baytur Turkish', count: 5 },
      ];

      const clusters = engine.clusterAgentRecords(records);
      expect(clusters.length).toBe(3);
    });
  });

  describe('Fuzzy typo matching', () => {
    it('should match minor single-character typos on longer names', () => {
      const result = engine.areSameAgent('SinoLogistics', 'SinoLogisticss');
      expect(result.match).toBe(true);
    });
  });
});
