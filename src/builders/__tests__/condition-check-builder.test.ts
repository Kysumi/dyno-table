import { describe, expect, it, vi } from "vitest";
import { eq, gt } from "../../conditions";
import { ExpressionError, ValidationError } from "../../errors";
import { ConditionCheckBuilder } from "../condition-check-builder";
import { TransactionBuilder } from "../transaction-builder";

describe("ConditionCheckBuilder - Jurassic Park Operations", () => {
  const tableName = "DinosaurEnclosures";
  const raptorKey = { pk: "PADDOCK-A", sk: "VELOCIRAPTOR#BLUE" };
  const trexKey = { pk: "PADDOCK-B", sk: "TYRANNOSAURUS#REXY" };

  describe("constructor", () => {
    it("should create a condition check builder for dinosaur enclosure monitoring", () => {
      const builder = new ConditionCheckBuilder(tableName, raptorKey);
      expect(builder).toBeInstanceOf(ConditionCheckBuilder);
    });
  });

  describe("condition - Basic Operations", () => {
    it("should verify T-Rex feeding status with direct condition", () => {
      const builder = new ConditionCheckBuilder(tableName, trexKey);
      const result = builder.condition(eq("feedingStatus", "HUNGRY"));
      expect(result).toBe(builder);
    });

    it("should check raptor pack status with condition function", () => {
      const builder = new ConditionCheckBuilder(tableName, raptorKey);
      const result = builder.condition((op) => op.eq("packStatus", "ALPHA"));
      expect(result).toBe(builder);
    });

    it("should validate dinosaur health levels", () => {
      const builder = new ConditionCheckBuilder(tableName, trexKey);
      const result = builder.condition((op) => op.gt("healthLevel", 75));
      expect(result).toBe(builder);
    });

    it("should check dinosaur age restrictions", () => {
      const builder = new ConditionCheckBuilder(tableName, raptorKey);
      const result = builder.condition((op) => op.between("age", 3, 15));
      expect(result).toBe(builder);
    });

    it("should verify dinosaur species classification", () => {
      const builder = new ConditionCheckBuilder(tableName, trexKey);
      const result = builder.condition((op) =>
        op.inArray("species", ["TYRANNOSAURUS_REX", "ALLOSAURUS", "GIGANOTOSAURUS"]),
      );
      expect(result).toBe(builder);
    });

    it("should check dinosaur name patterns", () => {
      const builder = new ConditionCheckBuilder(tableName, raptorKey);
      const result = builder.condition((op) => op.beginsWith("name", "BLUE"));
      expect(result).toBe(builder);
    });

    it("should verify genetic modifications", () => {
      const builder = new ConditionCheckBuilder(tableName, trexKey);
      const result = builder.condition((op) => op.contains("geneticModifications", "ENHANCED_INTELLIGENCE"));
      expect(result).toBe(builder);
    });

    it("should check for required dinosaur attributes", () => {
      const builder = new ConditionCheckBuilder(tableName, raptorKey);
      const result = builder.condition((op) => op.attributeExists("lastVetCheck"));
      expect(result).toBe(builder);
    });

    it("should verify absence of dangerous traits", () => {
      const builder = new ConditionCheckBuilder(tableName, trexKey);
      const result = builder.condition((op) => op.attributeNotExists("aggressiveOutbreak"));
      expect(result).toBe(builder);
    });
  });

  describe("condition - Nested Attributes", () => {
    it("should generate correct DynamoDB expression for nested dinosaur stats", () => {
      const builder = new ConditionCheckBuilder(tableName, trexKey);
      builder.condition((op) => op.gt("stats.strength", 90));

      // @ts-expect-error - toDynamoCommand is private but we're testing it
      const command = builder.toDynamoCommand();

      expect(command.conditionExpression).toBe("#0.#1 > :0");
      expect(command.expressionAttributeNames).toEqual({
        "#0": "stats",
        "#1": "strength",
      });
      expect(command.expressionAttributeValues).toEqual({
        ":0": 90,
      });
    });

    it("should generate correct DynamoDB expression for nested health metrics with BETWEEN", () => {
      const builder = new ConditionCheckBuilder(tableName, raptorKey);
      builder.condition((op) => op.between("health.vitality", 80, 100));

      // @ts-expect-error - toDynamoCommand is private but we're testing it
      const command = builder.toDynamoCommand();

      expect(command.conditionExpression).toBe("#0.#1 BETWEEN :0 AND :1");
      expect(command.expressionAttributeNames).toEqual({
        "#0": "health",
        "#1": "vitality",
      });
      expect(command.expressionAttributeValues).toEqual({
        ":0": 80,
        ":1": 100,
      });
    });

    it("should generate correct DynamoDB expression for deeply nested genetic data", () => {
      const builder = new ConditionCheckBuilder(tableName, trexKey);
      builder.condition((op) => op.eq("genetics.dna.purity", 100));

      // @ts-expect-error - toDynamoCommand is private but we're testing it
      const command = builder.toDynamoCommand();

      expect(command.conditionExpression).toBe("#0.#1.#2 = :0");
      expect(command.expressionAttributeNames).toEqual({
        "#0": "genetics",
        "#1": "dna",
        "#2": "purity",
      });
      expect(command.expressionAttributeValues).toEqual({
        ":0": 100,
      });
    });

    it("should generate correct DynamoDB expression for nested enclosure security levels", () => {
      const builder = new ConditionCheckBuilder(tableName, raptorKey);
      builder.condition((op) => op.gte("enclosure.security.level", 8));

      // @ts-expect-error - toDynamoCommand is private but we're testing it
      const command = builder.toDynamoCommand();

      expect(command.conditionExpression).toBe("#0.#1.#2 >= :0");
      expect(command.expressionAttributeNames).toEqual({
        "#0": "enclosure",
        "#1": "security",
        "#2": "level",
      });
      expect(command.expressionAttributeValues).toEqual({
        ":0": 8,
      });
    });

    it("should generate correct DynamoDB expression for nested behavioral patterns with CONTAINS", () => {
      const builder = new ConditionCheckBuilder(tableName, trexKey);
      builder.condition((op) => op.contains("behavior.patterns.hunting", "NOCTURNAL"));

      // @ts-expect-error - toDynamoCommand is private but we're testing it
      const command = builder.toDynamoCommand();

      expect(command.conditionExpression).toBe("contains(#0.#1.#2, :0)");
      expect(command.expressionAttributeNames).toEqual({
        "#0": "behavior",
        "#1": "patterns",
        "#2": "hunting",
      });
      expect(command.expressionAttributeValues).toEqual({
        ":0": "NOCTURNAL",
      });
    });

    it("should generate correct DynamoDB expression for nested feeding schedule with attribute_exists", () => {
      const builder = new ConditionCheckBuilder(tableName, raptorKey);
      builder.condition((op) => op.attributeExists("schedule.feeding.nextMeal"));

      // @ts-expect-error - toDynamoCommand is private but we're testing it
      const command = builder.toDynamoCommand();

      expect(command.conditionExpression).toBe("attribute_exists(#0.#1.#2)");
      expect(command.expressionAttributeNames).toEqual({
        "#0": "schedule",
        "#1": "feeding",
        "#2": "nextMeal",
      });
      expect(command.expressionAttributeValues).toBeUndefined();
    });

    it("should generate correct DynamoDB expression for nested sensor temperature readings", () => {
      const builder = new ConditionCheckBuilder(tableName, trexKey);
      builder.condition((op) => op.lt("sensors.temperature.current", 35));

      // @ts-expect-error - toDynamoCommand is private but we're testing it
      const command = builder.toDynamoCommand();

      expect(command.conditionExpression).toBe("#0.#1.#2 < :0");
      expect(command.expressionAttributeNames).toEqual({
        "#0": "sensors",
        "#1": "temperature",
        "#2": "current",
      });
      expect(command.expressionAttributeValues).toEqual({
        ":0": 35,
      });
    });

    it("should handle multiple nested attributes with different depths in complex conditions", () => {
      const builder = new ConditionCheckBuilder(tableName, raptorKey);
      builder.condition((op) =>
        op.and(
          op.eq("habitat.type", "FOREST"),
          op.gt("pack.stats.agility", 85),
          op.attributeExists("training.commands.hunt.advanced"),
          op.lt("vitals.heart.rate", 120),
        ),
      );

      // @ts-expect-error - toDynamoCommand is private but we're testing it
      const command = builder.toDynamoCommand();

      expect(command.conditionExpression).toBe(
        "(#0.#1 = :0 AND #2.#3.#4 > :1 AND attribute_exists(#5.#6.#7.#8) AND #9.#10.#11 < :2)",
      );
      expect(command.expressionAttributeNames).toEqual({
        "#0": "habitat",
        "#1": "type",
        "#2": "pack",
        "#3": "stats",
        "#4": "agility",
        "#5": "training",
        "#6": "commands",
        "#7": "hunt",
        "#8": "advanced",
        "#9": "vitals",
        "#10": "heart",
        "#11": "rate",
      });
      expect(command.expressionAttributeValues).toEqual({
        ":0": "FOREST",
        ":1": 85,
        ":2": 120,
      });
    });
  });

  describe("condition - Complex Logical Operations", () => {
    it("should validate raptor pack readiness with AND conditions", () => {
      const builder = new ConditionCheckBuilder(tableName, raptorKey);
      const result = builder.condition((op) =>
        op.and(
          op.eq("status", "ACTIVE"),
          op.gt("packSize", 2),
          op.lt("aggressionLevel", 7),
          op.attributeExists("lastTraining"),
        ),
      );
      expect(result).toBe(builder);
    });

    it("should check T-Rex feeding conditions with nested AND/OR", () => {
      const builder = new ConditionCheckBuilder(tableName, trexKey);
      const result = builder.condition((op) =>
        op.and(
          op.or(op.eq("hungerLevel", "STARVING"), op.gt("daysSinceFeeding", 3)),
          op.lt("visitorCount", 50),
          op.eq("weatherCondition", "CLEAR"),
        ),
      );
      expect(result).toBe(builder);
    });

    it("should verify dinosaur NOT in quarantine with complex nested conditions", () => {
      const builder = new ConditionCheckBuilder(tableName, raptorKey);
      const result = builder.condition((op) =>
        op.and(
          op.not(op.eq("status", "QUARANTINED")),
          op.or(
            op.eq("health.status", "EXCELLENT"),
            op.and(op.eq("health.status", "GOOD"), op.attributeNotExists("symptoms")),
          ),
          op.gte("stats.immunity", 85),
        ),
      );
      expect(result).toBe(builder);
    });

    it("should validate breeding eligibility with nested attribute conditions", () => {
      const builder = new ConditionCheckBuilder(tableName, trexKey);
      const result = builder.condition((op) =>
        op.and(
          op.between("age", 5, 20),
          op.eq("genetics.dna.viability", "HIGH"),
          op.gt("health.reproductive.fertility", 90),
          op.not(op.attributeExists("breeding.cooldown")),
          op.inArray("genetics.traits.dominant", ["SIZE", "INTELLIGENCE", "LONGEVITY"]),
        ),
      );
      expect(result).toBe(builder);
    });

    it("should check habitat security with multiple nested conditions", () => {
      const builder = new ConditionCheckBuilder(tableName, raptorKey);
      const result = builder.condition((op) =>
        op.and(
          op.eq("security.status", "ACTIVE"),
          op.gt("security.fencing.integrity", 95),
          op.lt("security.alerts.count", 3),
          op.attributeExists("security.lastInspection"),
          op.or(op.eq("security.guards.status", "ON_DUTY"), op.eq("security.automated.status", "ARMED")),
        ),
      );
      expect(result).toBe(builder);
    });
  });

  describe("toDynamoCommand", () => {
    it("should generate valid command for dinosaur status check", () => {
      const builder = new ConditionCheckBuilder(tableName, trexKey);
      builder.condition(eq("status", "SEDATED"));

      // @ts-expect-error - toDynamoCommand is private but we're testing it
      const command = builder.toDynamoCommand();

      expect(command).toEqual({
        tableName,
        key: trexKey,
        conditionExpression: expect.any(String),
        expressionAttributeNames: expect.any(Object),
        expressionAttributeValues: expect.any(Object),
      });
    });

    it("should generate valid command for nested attribute conditions", () => {
      const builder = new ConditionCheckBuilder(tableName, raptorKey);
      builder.condition((op) => op.gt("stats.agility", 85));

      // @ts-expect-error - toDynamoCommand is private but we're testing it
      const command = builder.toDynamoCommand();

      expect(command).toEqual({
        tableName,
        key: raptorKey,
        conditionExpression: expect.any(String),
        expressionAttributeNames: expect.any(Object),
        expressionAttributeValues: expect.any(Object),
      });
    });

    it("should generate valid command for complex nested conditions", () => {
      const builder = new ConditionCheckBuilder(tableName, trexKey);
      builder.condition((op) =>
        op.and(
          op.eq("behavior.hunting.strategy", "AMBUSH"),
          op.between("genetics.dna.sequences.aggressiveness", 60, 80),
          op.attributeExists("training.obedience.lastSession"),
        ),
      );

      // @ts-expect-error - toDynamoCommand is private but we're testing it
      const command = builder.toDynamoCommand();

      expect(command).toEqual({
        tableName,
        key: trexKey,
        conditionExpression: expect.any(String),
        expressionAttributeNames: expect.any(Object),
        expressionAttributeValues: expect.any(Object),
      });
    });

    it("should throw error when no condition is set for feeding check", () => {
      const builder = new ConditionCheckBuilder(tableName, raptorKey);

      // @ts-expect-error - toDynamoCommand is private but we're testing it
      expect(() => builder.toDynamoCommand()).toThrow(ValidationError);
    });

    it("should throw error when condition fails to generate expression", () => {
      const builder = new ConditionCheckBuilder(tableName, trexKey);
      // Mock a condition that would cause expression generation to fail
      // biome-ignore lint: Intentionally done for test
      builder.condition({ type: "eq" } as any);

      // @ts-expect-error - toDynamoCommand is private but we're testing it
      expect(() => builder.toDynamoCommand()).toThrow(ExpressionError);
    });
  });

  describe("withTransaction", () => {
    it("should add dinosaur status check to transaction", () => {
      const mockExecutor = vi.fn().mockResolvedValue(undefined);
      const indexConfig = {
        partitionKey: "pk",
        sortKey: "sk",
      };
      const transaction = new TransactionBuilder(mockExecutor, indexConfig);
      const conditionCheckSpy = vi.spyOn(transaction, "conditionCheckWithCommand");

      const builder = new ConditionCheckBuilder(tableName, raptorKey);
      builder.condition(eq("escapeAttempts", 0));

      const result = builder.withTransaction(transaction);

      expect(result).toBe(builder);
      expect(conditionCheckSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          tableName,
          key: raptorKey,
          conditionExpression: expect.any(String),
        }),
      );
    });

    it("should add complex nested condition check to transaction", () => {
      const mockExecutor = vi.fn().mockResolvedValue(undefined);
      const indexConfig = {
        partitionKey: "pk",
        sortKey: "sk",
      };
      const transaction = new TransactionBuilder(mockExecutor, indexConfig);
      const conditionCheckSpy = vi.spyOn(transaction, "conditionCheckWithCommand");

      const builder = new ConditionCheckBuilder(tableName, trexKey);
      builder.condition((op) =>
        op.and(
          op.eq("containment.status", "SECURE"),
          op.lt("behavior.agitation.level", 5),
          op.attributeExists("monitoring.sensors.active"),
        ),
      );

      const result = builder.withTransaction(transaction);

      expect(result).toBe(builder);
      expect(conditionCheckSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          tableName,
          key: trexKey,
          conditionExpression: expect.any(String),
          expressionAttributeNames: expect.any(Object),
          expressionAttributeValues: expect.any(Object),
        }),
      );
    });

    it("should throw error when adding unconditioned check to transaction", () => {
      const mockExecutor = vi.fn().mockResolvedValue(undefined);
      const indexConfig = {
        partitionKey: "pk",
        sortKey: "sk",
      };
      const transaction = new TransactionBuilder(mockExecutor, indexConfig);
      const builder = new ConditionCheckBuilder(tableName, trexKey);

      expect(() => builder.withTransaction(transaction)).toThrow(ValidationError);
    });
  });

  describe("debug", () => {
    it("should return readable representation of dinosaur condition check", () => {
      const builder = new ConditionCheckBuilder(tableName, raptorKey);
      builder.condition(eq("species", "VELOCIRAPTOR"));

      const debug = builder.debug();

      expect(debug).toEqual({
        raw: {
          tableName,
          key: raptorKey,
          conditionExpression: "#0 = :0",
          expressionAttributeNames: { "#0": "species" },
          expressionAttributeValues: { ":0": "VELOCIRAPTOR" },
        },
        readable: {
          conditionExpression: 'species = "VELOCIRAPTOR"',
        },
      });
    });

    it("should return readable representation of nested attribute condition", () => {
      const builder = new ConditionCheckBuilder(tableName, trexKey);
      builder.condition(gt("stats.bite_force", 12800));

      const debug = builder.debug();

      expect(debug).toEqual({
        raw: {
          tableName,
          key: trexKey,
          conditionExpression: "#0.#1 > :0",
          expressionAttributeNames: { "#0": "stats", "#1": "bite_force" },
          expressionAttributeValues: { ":0": 12800 },
        },
        readable: {
          conditionExpression: "stats.bite_force > 12800",
        },
      });
    });

    it("should return readable representation of complex nested conditions", () => {
      const builder = new ConditionCheckBuilder(tableName, raptorKey);
      builder.condition((op) =>
        op.and(
          op.eq("habitat.type", "FOREST"),
          op.between("pack.size", 3, 6),
          op.attributeExists("training.commands.hunt"),
        ),
      );

      const debug = builder.debug();

      expect(debug.raw).toEqual({
        tableName,
        key: raptorKey,
        conditionExpression: expect.stringContaining("AND"),
        expressionAttributeNames: expect.objectContaining({
          "#0": "habitat",
          "#1": "type",
          "#2": "pack",
          "#3": "size",
        }),
        expressionAttributeValues: expect.objectContaining({
          ":0": "FOREST",
          ":1": 3,
          ":2": 6,
        }),
      });

      expect(debug.readable.conditionExpression).toContain('habitat.type = "FOREST"');
      expect(debug.readable.conditionExpression).toContain("pack.size BETWEEN 3 AND 6");
      expect(debug.readable.conditionExpression).toContain("attribute_exists(training.commands.hunt)");
    });

    it("should handle deeply nested attributes in debug output", () => {
      const builder = new ConditionCheckBuilder(tableName, trexKey);
      builder.condition((op) =>
        op.and(
          op.eq("genetics.dna.sequences.vision.acuity", "EXCELLENT"),
          op.gt("behavior.hunting.success.rate", 0.85),
          op.ne("medical.history.injuries.severity", "CRITICAL"),
        ),
      );

      const debug = builder.debug();

      expect(debug.raw.expressionAttributeNames).toEqual(
        expect.objectContaining({
          "#0": "genetics",
          "#1": "dna",
          "#2": "sequences",
          "#3": "vision",
          "#4": "acuity",
          "#5": "behavior",
          "#6": "hunting",
          "#7": "success",
          "#8": "rate",
          "#9": "medical",
          "#10": "history",
          "#11": "injuries",
          "#12": "severity",
        }),
      );

      expect(debug.readable.conditionExpression).toContain('"EXCELLENT"');
      expect(debug.readable.conditionExpression).toContain("> 0.85");
      expect(debug.readable.conditionExpression).toContain('<> "CRITICAL"');
      expect(debug.readable.conditionExpression).toContain("AND");
    });

    it("should throw error when debugging without condition", () => {
      const builder = new ConditionCheckBuilder(tableName, raptorKey);
      expect(() => builder.debug()).toThrow(ValidationError);
    });
  });

  describe("Comprehensive Dinosaur Management Scenarios", () => {
    it("should validate pre-transport dinosaur conditions", () => {
      const builder = new ConditionCheckBuilder("DinosaurTransport", {
        pk: "TRANSPORT-001",
        sk: "DINOSAUR-ANKYLOSAURUS#BUMPY",
      });

      builder.condition((op) =>
        op.and(
          op.eq("medical.clearance.status", "APPROVED"),
          op.lt("stress.level", 30),
          op.eq("transport.container.ready", true),
          op.attributeExists("sedation.administered"),
          op.between("vital.signs.heart_rate", 40, 80),
          op.not(op.attributeExists("behavioral.warnings.active")),
        ),
      );

      const debug = builder.debug();
      expect(debug.readable.conditionExpression).toContain('"APPROVED"');
      expect(debug.readable.conditionExpression).toContain("NOT");
      expect(debug.readable.conditionExpression).toContain("attribute_exists");
      expect(debug.readable.conditionExpression).toContain("BETWEEN 40 AND 80");
    });

    it("should verify breeding program eligibility", () => {
      const builder = new ConditionCheckBuilder("BreedingProgram", {
        pk: "BREED-PROG-001",
        sk: "TRICERATOPS#CERA",
      });

      builder.condition((op) =>
        op.and(
          op.between("age", 4, 12),
          op.eq("genetics.health.screening", "PASSED"),
          op.gt("reproductive.fitness.score", 8.5),
          op.attributeNotExists("genetic.disorders"),
          op.or(op.eq("bloodline.rarity", "RARE"), op.eq("traits.desirable.count", 5)),
          op.lt("offspring.previous.total", 3),
        ),
      );

      expect(() => builder.debug()).not.toThrow();
    });

    it("should validate research specimen conditions", () => {
      const builder = new ConditionCheckBuilder("ResearchLab", {
        pk: "LAB-GENETICS-01",
        sk: "SPECIMEN-DILOPHOSAURUS#SPITTER",
      });

      builder.condition((op) =>
        op.and(
          op.eq("research.ethics.approved", true),
          op.lt("research.procedures.invasive.count", 3),
          op.attributeExists("consent.documentation"),
          op.between("health.indicators.stress", 0, 25),
          op.not(op.eq("status", "TRAUMATIZED")),
          op.or(
            op.eq("research.type", "BEHAVIORAL"),
            op.and(op.eq("research.type", "GENETIC"), op.attributeExists("anesthesia.clearance")),
          ),
        ),
      );

      const debug = builder.debug();
      expect(debug.raw.conditionExpression).toContain("AND");
      expect(debug.raw.conditionExpression).toContain("OR");
      expect(debug.raw.conditionExpression).toContain("NOT");
    });
  });

  describe("Nested Attribute Edge Cases", () => {
    it("should handle single-level attributes alongside deeply nested ones", () => {
      const builder = new ConditionCheckBuilder(tableName, raptorKey);
      builder.condition((op) =>
        op.and(
          op.eq("species", "VELOCIRAPTOR"),
          op.gt("genetics.dna.sequences.aggressiveness.level", 75),
          op.attributeExists("status"),
          op.lt("behavior.pack.hierarchy.dominance.score", 90),
        ),
      );

      // @ts-expect-error - toDynamoCommand is private
      const command = builder.toDynamoCommand();

      expect(command.conditionExpression).toBe(
        "(#0 = :0 AND #1.#2.#3.#4.#5 > :1 AND attribute_exists(#6) AND #7.#8.#9.#10.#11 < :2)",
      );
      expect(command.expressionAttributeNames).toEqual({
        "#0": "species",
        "#1": "genetics",
        "#2": "dna",
        "#3": "sequences",
        "#4": "aggressiveness",
        "#5": "level",
        "#6": "status",
        "#7": "behavior",
        "#8": "pack",
        "#9": "hierarchy",
        "#10": "dominance",
        "#11": "score",
      });
      expect(command.expressionAttributeValues).toEqual({
        ":0": "VELOCIRAPTOR",
        ":1": 75,
        ":2": 90,
      });
    });

    it("should handle nested attributes with similar path segments correctly", () => {
      const builder = new ConditionCheckBuilder(tableName, trexKey);
      builder.condition((op) =>
        op.and(
          op.eq("health.status.current", "EXCELLENT"),
          op.gt("health.vitals.heart.rate", 60),
          op.lt("health.vitals.blood.pressure", 140),
          op.attributeExists("health.records.latest"),
        ),
      );

      // @ts-expect-error - toDynamoCommand is private
      const command = builder.toDynamoCommand();

      expect(command.conditionExpression).toBe(
        "(#0.#1.#2 = :0 AND #0.#3.#4.#5 > :1 AND #0.#3.#6.#7 < :2 AND attribute_exists(#0.#8.#9))",
      );
      expect(command.expressionAttributeNames).toEqual({
        "#0": "health",
        "#1": "status",
        "#2": "current",
        "#3": "vitals",
        "#4": "heart",
        "#5": "rate",
        "#6": "blood",
        "#7": "pressure",
        "#8": "records",
        "#9": "latest",
      });
      expect(command.expressionAttributeValues).toEqual({
        ":0": "EXCELLENT",
        ":1": 60,
        ":2": 140,
      });
    });

    it("should handle very deeply nested attributes (5+ levels)", () => {
      const builder = new ConditionCheckBuilder(tableName, raptorKey);
      builder.condition((op) =>
        op.eq("genetics.modifications.neural.enhancement.cognitive.intelligence.level", "SUPERIOR"),
      );

      // @ts-expect-error - toDynamoCommand is private
      const command = builder.toDynamoCommand();

      expect(command.conditionExpression).toBe("#0.#1.#2.#3.#4.#5.#6 = :0");
      expect(command.expressionAttributeNames).toEqual({
        "#0": "genetics",
        "#1": "modifications",
        "#2": "neural",
        "#3": "enhancement",
        "#4": "cognitive",
        "#5": "intelligence",
        "#6": "level",
      });
      expect(command.expressionAttributeValues).toEqual({
        ":0": "SUPERIOR",
      });
    });

    it("should handle nested attributes with reserved DynamoDB keywords", () => {
      const builder = new ConditionCheckBuilder(tableName, trexKey);
      builder.condition((op) =>
        op.and(
          op.eq("data.size.current", "LARGE"),
          op.gt("status.count.active", 5),
          op.attributeExists("order.type.primary"),
        ),
      );

      // @ts-expect-error - toDynamoCommand is private
      const command = builder.toDynamoCommand();

      expect(command.conditionExpression).toBe("(#0.#1.#2 = :0 AND #3.#4.#5 > :1 AND attribute_exists(#6.#7.#8))");
      expect(command.expressionAttributeNames).toEqual({
        "#0": "data",
        "#1": "size",
        "#2": "current",
        "#3": "status",
        "#4": "count",
        "#5": "active",
        "#6": "order",
        "#7": "type",
        "#8": "primary",
      });
      expect(command.expressionAttributeValues).toEqual({
        ":0": "LARGE",
        ":1": 5,
      });
    });

    it("should handle nested attributes in complex logical expressions with NOT", () => {
      const builder = new ConditionCheckBuilder(tableName, raptorKey);
      builder.condition((op) =>
        op.or(
          op.not(op.eq("containment.status.security.level", "BREACHED")),
          op.and(
            op.attributeExists("emergency.protocols.lockdown.activated"),
            op.gt("security.response.team.size", 10),
          ),
        ),
      );

      // @ts-expect-error - toDynamoCommand is private
      const command = builder.toDynamoCommand();

      expect(command.conditionExpression).toBe(
        "(NOT (#0.#1.#2.#3 = :0) OR (attribute_exists(#4.#5.#6.#7) AND #2.#8.#9.#10 > :1))",
      );
      expect(command.expressionAttributeNames).toEqual({
        "#0": "containment",
        "#1": "status",
        "#2": "security",
        "#3": "level",
        "#4": "emergency",
        "#5": "protocols",
        "#6": "lockdown",
        "#7": "activated",
        "#8": "response",
        "#9": "team",
        "#10": "size",
      });
      expect(command.expressionAttributeValues).toEqual({
        ":0": "BREACHED",
        ":1": 10,
      });
    });
  });

  describe("Nested Attribute Expression Integration", () => {
    it("should generate correct expressions for nested attributes with proper placeholder handling", () => {
      const builder = new ConditionCheckBuilder("DinosaurTracking", {
        pk: "TRACK-001",
        sk: "STEGOSAURUS#SPIKE",
      });

      builder.condition((op) =>
        op.and(
          op.eq("location.zone.sector", "HERBIVORE-3A"),
          op.gt("vitals.temperature.body", 98.6),
          op.between("behavior.activity.level", 3, 7),
          op.attributeExists("sensors.gps.coordinates"),
          op.lt("health.metrics.stress.cortisol", 50),
        ),
      );

      // @ts-expect-error - toDynamoCommand is private but we're testing expression generation
      const command = builder.toDynamoCommand();

      // Verify expression structure
      expect(command.conditionExpression).toBeTruthy();
      expect(command.conditionExpression).toContain("AND");
      expect(command.conditionExpression).toContain("=");
      expect(command.conditionExpression).toContain(">");
      expect(command.conditionExpression).toContain("BETWEEN");
      expect(command.conditionExpression).toContain("attribute_exists");
      expect(command.conditionExpression).toContain("<");

      // Verify attribute names are properly mapped
      expect(command.expressionAttributeNames).toBeDefined();
      // biome-ignore lint: Intentionally done for test
      const attrNames = Object.values(command.expressionAttributeNames!);
      expect(attrNames).toContain("location");
      expect(attrNames).toContain("zone");
      expect(attrNames).toContain("sector");
      expect(attrNames).toContain("vitals");
      expect(attrNames).toContain("temperature");
      expect(attrNames).toContain("body");

      // Verify values are properly mapped
      expect(command.expressionAttributeValues).toBeDefined();
      // biome-ignore lint: Intentionally done for test
      const attrValues = Object.values(command.expressionAttributeValues!);
      expect(attrValues).toContain("HERBIVORE-3A");
      expect(attrValues).toContain(98.6);
      expect(attrValues).toContain(3);
      expect(attrValues).toContain(7);
      expect(attrValues).toContain(50);
    });

    it("should handle deeply nested attributes in different logical branches", () => {
      const builder = new ConditionCheckBuilder("DinosaurBreeding", {
        pk: "BREED-2023-001",
        sk: "TRICERATOPS#CERA-M",
      });

      builder.condition<{
        genetics: {
          lineage: {
            maternal: { species: string; generation: number; defects: string };
            paternal: { species: string };
          };
          compatibility: { score: number };
          risk: { assessment: { level: number } };
        };
      }>((op) =>
        op.or(
          op.and(
            op.eq("genetics.lineage.maternal.species", "TRICERATOPS_HORRIDUS"),
            op.gte("genetics.lineage.maternal.generation", 3),
            op.attributeNotExists("genetics.lineage.maternal.defects"),
          ),
          op.and(
            op.eq("genetics.lineage.paternal.species", "TRICERATOPS_PRORSUS"),
            op.gt("genetics.compatibility.score", 85),
            op.lt("genetics.risk.assessment.level", 3),
          ),
        ),
      );

      // @ts-expect-error - toDynamoCommand is private but we're testing expression generation
      const command = builder.toDynamoCommand();

      // Verify complex nested expression structure
      expect(command.conditionExpression).toContain("OR");
      expect(command.conditionExpression).toContain("AND");
      expect(command.conditionExpression).toContain("attribute_not_exists");

      // Verify all nested path segments are mapped
      // biome-ignore lint: Intentionally done for test
      const attrNames = Object.values(command.expressionAttributeNames!);
      expect(attrNames).toContain("genetics");
      expect(attrNames).toContain("lineage");
      expect(attrNames).toContain("maternal");
      expect(attrNames).toContain("paternal");
      expect(attrNames).toContain("species");
      expect(attrNames).toContain("generation");
      expect(attrNames).toContain("defects");
      expect(attrNames).toContain("compatibility");
      expect(attrNames).toContain("score");

      // Verify species values are correctly mapped
      // biome-ignore lint: Intentionally done for test
      const attrValues = Object.values(command.expressionAttributeValues!);
      expect(attrValues).toContain("TRICERATOPS_HORRIDUS");
      expect(attrValues).toContain("TRICERATOPS_PRORSUS");
      expect(attrValues).toContain(85);
      expect(attrValues).toContain(3);
    });
  });
});
