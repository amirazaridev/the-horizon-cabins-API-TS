import type { Request, Response } from "express";
import * as priceRuleService from "../services/price-rule.service.js";
import { sendSuccess } from "../utils/apiResponse.js";
import type { PriceRuleFilters } from "../repositories/price-rule.repository.js";

export async function list(req: Request, res: Response): Promise<void> {
  const cabinId = Number(req.params.cabinId);
  const filters = (req.parseQuery ?? {}) as PriceRuleFilters;

  const rules = await priceRuleService.listRules(cabinId, filters);
  sendSuccess(res, { data: { rules } });
}

export async function create(req: Request, res: Response): Promise<void> {
  const cabinId = Number(req.params.cabinId);
  const rule = await priceRuleService.createRule(cabinId, req.body, req.user!.id);
  sendSuccess(res, { statusCode: 201, data: { rule } });
}

export async function update(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const rule = await priceRuleService.updateRule(id, req.body, req.user!.id);
  sendSuccess(res, { data: { rule } });
}

export async function remove(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  await priceRuleService.deleteRule(id, req.user!.id);
  sendSuccess(res, { statusCode: 204 });
}

export async function history(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const entries = await priceRuleService.getRuleHistory(id);
  sendSuccess(res, { data: { history: entries } });
}

export async function bulkCreate(req: Request, res: Response): Promise<void> {
  const result = await priceRuleService.bulkCreateRules(req.body, req.user!.id);
  sendSuccess(res, { statusCode: 201, data: result });
}
