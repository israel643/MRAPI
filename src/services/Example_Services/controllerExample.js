import exampleService from './servicesExample';

export const exampleController = (req, res) => {
    const message = exampleService.getMessage();
    res.json({ message });
};