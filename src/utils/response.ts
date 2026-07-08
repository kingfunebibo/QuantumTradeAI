import { Response } from "express";

export function successResponse<T>(
  res: Response,
  data: T,
  message = "Success",
) {
  return res.status(200).json({
    success: true,
    message,
    data,
  });
}

export function createdResponse<T>(
  res: Response,
  data: T,
  message = "Resource created successfully",
) {
  return res.status(201).json({
    success: true,
    message,
    data,
  });
}

export function noContentResponse(res: Response) {
  return res.status(204).send();
}